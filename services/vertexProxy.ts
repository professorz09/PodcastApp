// Shared Vertex/Gemini proxy logic — used by both the Vercel serverless
// function (api/gemini.ts) and the local Express dev server (server.ts).
//
// Backend selection:
//   1. Vertex AI via Service Account (GCP_SA_KEY + GCP_PROJECT_ID).
//      Preferred — billed against the GCP project's free credit and
//      avoids bundling a Gemini key into anything client-reachable.
//   2. Direct Gemini API key (GEMINI_API_KEY). Fallback / legacy.
//
// thinkingConfig translation:
//   Gemini 2.5 only understands `{ thinkingBudget: <integer> }`.
//   Gemini 3.x natively accepts `{ thinkingLevel: "minimal"|"low"|
//   "medium"|"high" }` — for those models pass through unchanged.
//   The translation only fires for non-3.x models when the SDK shape
//   `thinkingLevel` is present without a matching `thinkingBudget`.

import { GoogleGenAI } from '@google/genai';

// Default location for Gemini 3.x is "global" — gemini-3.x preview
// surfaces 404 from regional hostnames. us-central1 still works for
// Gemini 2.5 if the caller overrides via GCP_REGION.
const DEFAULT_LOCATION = 'global';

let cachedClient: GoogleGenAI | null = null;
let cachedMode: 'vertex' | 'apikey' | null = null;

export function getGeminiClient(): { ai: GoogleGenAI; mode: 'vertex' | 'apikey' } {
  if (cachedClient && cachedMode) return { ai: cachedClient, mode: cachedMode };

  const saKey = process.env.GCP_SA_KEY;
  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_REGION || DEFAULT_LOCATION;

  if (saKey && projectId) {
    let credentials: any;
    try {
      credentials = JSON.parse(saKey);
    } catch {
      throw new Error('GCP_SA_KEY is not valid JSON');
    }
    cachedClient = new GoogleGenAI({
      vertexai: true,
      project: projectId,
      location,
      googleAuthOptions: { credentials },
    });
    cachedMode = 'vertex';
    return { ai: cachedClient, mode: 'vertex' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
    cachedMode = 'apikey';
    return { ai: cachedClient, mode: 'apikey' };
  }

  throw new Error(
    'No Gemini backend configured. Set GCP_SA_KEY + GCP_PROJECT_ID (preferred) or GEMINI_API_KEY.',
  );
}

// Budget ladder lifted from Vertex's 2.5 flash-lite docs. MINIMAL maps
// to 512 (not 0) because flash-lite skips thinking at budget 0 and
// regresses to single-word answers that fail JSON schema validation.
// HIGH maps to -1 ("DYNAMIC") so the model picks within tier ceiling.
const THINKING_BUDGET_25: Record<string, number> = {
  OFF: 0,
  NONE: 0,
  MINIMAL: 512,
  LOW: 1024,
  MEDIUM: 8192,
  HIGH: -1,
};

function isGemini3(model: string): boolean {
  return /^gemini-3(\.|-)/i.test(model);
}

export function translateThinkingForVertex(model: string, genConfig: any): any {
  if (!genConfig || typeof genConfig !== 'object') return genConfig;
  const tc = genConfig.thinkingConfig;
  if (!tc || typeof tc !== 'object') return genConfig;
  // Gemini 3.x understands thinkingLevel natively — pass through.
  if (isGemini3(model)) return genConfig;
  // Only act when thinkingLevel is set without a thinkingBudget.
  if (!('thinkingLevel' in tc) || 'thinkingBudget' in tc) return genConfig;
  const level = String(tc.thinkingLevel ?? '').toUpperCase();
  const budget = THINKING_BUDGET_25[level];
  if (budget === undefined) return genConfig;
  const { thinkingLevel: _drop, ...restThinking } = tc;
  return {
    ...genConfig,
    thinkingConfig: { ...restThinking, thinkingBudget: budget },
  };
}

// Vertex AI strictly requires every `contents` entry to carry an explicit
// `role` of "user" or "model". The Gemini direct API and older SDK paths
// silently auto-wrap shapes like `{ parts: [...] }` or a bare parts
// array, but Vertex returns 400 INVALID_ARGUMENT. We normalize once at
// the proxy so 30+ call sites don't each need to spell out the role.
function looksLikePart(x: any): boolean {
  return !!x && typeof x === 'object' && (
    'text' in x || 'inlineData' in x || 'fileData' in x ||
    'functionCall' in x || 'functionResponse' in x || 'executableCode' in x ||
    'codeExecutionResult' in x || 'thought' in x
  );
}

function normalizeOne(item: any): any {
  if (!item || typeof item !== 'object') return item;
  // Already canonical shape — leave alone.
  if (item.role && item.parts) return item;
  // `{ parts: [...] }` with no role — default to user.
  if (item.parts && !item.role) return { role: 'user', ...item };
  // Bare Part (e.g. `{ text: '...' }` or `{ inlineData: ... }`) — wrap.
  if (looksLikePart(item)) return { role: 'user', parts: [item] };
  return item;
}

export function normalizeContents(contents: any): any {
  if (contents == null) return contents;
  // Plain string — SDK wraps as user message itself.
  if (typeof contents === 'string') return contents;
  if (Array.isArray(contents)) {
    // Mixed array of bare Parts → wrap whole thing as one user message.
    if (contents.length > 0 && contents.every(looksLikePart)) {
      return [{ role: 'user', parts: contents }];
    }
    return contents.map(normalizeOne);
  }
  return normalizeOne(contents);
}

export async function callGemini(model: string, contents: any, genConfig: any) {
  const { ai, mode } = getGeminiClient();
  const finalConfig = mode === 'vertex' ? translateThinkingForVertex(model, genConfig) : genConfig;
  const finalContents = mode === 'vertex' ? normalizeContents(contents) : contents;
  return ai.models.generateContent({ model, contents: finalContents, config: finalConfig });
}