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
import { createSign, createPrivateKey } from 'crypto';

// Default location for Gemini 3.x is "global" — gemini-3.x preview
// surfaces 404 from regional hostnames. us-central1 still works for
// Gemini 2.5 if the caller overrides via GCP_REGION.
const DEFAULT_LOCATION = 'global';

let cachedClient: GoogleGenAI | null = null;
let cachedMode: 'vertex' | 'apikey' | null = null;

export function isValidPrivateKey(keyStr: any): boolean {
  if (!keyStr || typeof keyStr !== 'string' || keyStr.length < 100) return false;
  try {
    const normalized = keyStr.replace(/\\n/g, '\n');
    createPrivateKey(normalized);
    return true;
  } catch {
    return false;
  }
}

export function getGeminiClient(): { ai: GoogleGenAI; mode: 'vertex' | 'apikey' } {
  if (cachedClient && cachedMode) return { ai: cachedClient, mode: cachedMode };

  const saKey = process.env.GCP_SA_KEY;
  let projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_REGION || DEFAULT_LOCATION;

  if (saKey) {
    let credentials: any = null;
    try {
      credentials = JSON.parse(saKey);
    } catch {
      console.warn('GCP_SA_KEY is not valid JSON, skipping Vertex AI mode.');
    }
    projectId = projectId || credentials?.project_id;
    if (projectId && credentials?.private_key && isValidPrivateKey(credentials.private_key)) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      cachedClient = new GoogleGenAI({
        vertexai: true,
        project: projectId,
        location,
        googleAuthOptions: { credentials },
      });
      cachedMode = 'vertex';
      return { ai: cachedClient, mode: 'vertex' };
    } else if (saKey) {
      console.warn('GCP_SA_KEY does not contain a valid RSA private key. Falling back to direct API key.');
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
    cachedMode = 'apikey';
    return { ai: cachedClient, mode: 'apikey' };
  }

  throw new Error(
    'No valid Gemini backend configured. Set a valid GCP_SA_KEY with RSA private key (preferred) or GEMINI_API_KEY.',
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

export function sanitizeConfigForApiKey(genConfig: any): any {
  if (!genConfig || typeof genConfig !== 'object') return genConfig;
  const copy = { ...genConfig };
  if (copy.imageConfig && typeof copy.imageConfig === 'object') {
    const { personGeneration: _drop, ...restImageConfig } = copy.imageConfig;
    copy.imageConfig = restImageConfig;
  }
  return copy;
}

export async function callGemini(model: string, contents: any, genConfig: any) {
  const clientInfo = getGeminiClient();
  const finalConfig = clientInfo.mode === 'vertex'
    ? translateThinkingForVertex(model, genConfig)
    : sanitizeConfigForApiKey(genConfig);
  const finalContents = clientInfo.mode === 'vertex' ? normalizeContents(contents) : contents;

  try {
    return await clientInfo.ai.models.generateContent({ model, contents: finalContents, config: finalConfig });
  } catch (error: any) {
    const msg = String(error?.message || '');
    const isQuota = /RESOURCE_EXHAUSTED|429|quota/i.test(msg);
    const isImageModel = /image/i.test(model) || !!finalConfig?.responseModalities?.includes?.('IMAGE');

    // For image models hitting quota limits on Vertex, do NOT fall back to GEMINI_API_KEY
    // because Developer API free tier has a limit of 0 for image models. Instead, bubble
    // up the 429 so the client can retry Vertex AI after quota replenishes.
    if (clientInfo.mode === 'vertex' && process.env.GEMINI_API_KEY && !(isImageModel && isQuota)) {
      console.warn(`Vertex AI call failed (${msg}), falling back to GEMINI_API_KEY...`);
      const fallbackAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      // Only permanently demote cached mode on unrecoverable credentials/auth errors,
      // NOT on temporary 429, 503, or rate limits.
      const isFatalAuth = /unauthenticated|invalid_grant|private.?key|decoder/i.test(msg);
      if (isFatalAuth) {
        cachedClient = fallbackAi;
        cachedMode = 'apikey';
      }
      const safeConfig = sanitizeConfigForApiKey(genConfig);
      return await fallbackAi.models.generateContent({ model, contents, config: safeConfig });
    }
    throw error;
  }
}

// ── GCP OAuth2 access token via Service Account key ─────────────────────────
// Token is cached in module memory (valid 1 hour; refreshed 60 s before expiry).
let _tokenCache: { value: string; expiresAt: number } | null = null;

export async function getGCPAccessToken(): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now + 60_000) return _tokenCache.value;

  const saKey = process.env.GCP_SA_KEY;
  if (!saKey) throw new Error('GCP_SA_KEY is not set');

  let creds: any;
  try { creds = JSON.parse(saKey); } catch { throw new Error('GCP_SA_KEY is not valid JSON'); }

  if (!creds.private_key || !isValidPrivateKey(creds.private_key)) {
    throw new Error('GCP_SA_KEY contains an invalid or placeholder private key');
  }

  const cleanPrivateKey = creds.private_key.replace(/\\n/g, '\n');
  const nowSec = Math.floor(now / 1000);
  const jwtPayload = {
    iss: creds.client_email,
    sub: creds.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
  };

  const hdr = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const pay = Buffer.from(JSON.stringify(jwtPayload)).toString('base64url');
  const signer = createSign('RSA-SHA256');
  signer.update(`${hdr}.${pay}`);
  const sig = signer.sign(cleanPrivateKey, 'base64url');
  const jwt = `${hdr}.${pay}.${sig}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const tokenData = await tokenRes.json() as any;
  if (!tokenRes.ok) {
    throw new Error(`GCP token error: ${tokenData.error_description || tokenData.error || tokenRes.status}`);
  }

  _tokenCache = {
    value: tokenData.access_token,
    expiresAt: now + (tokenData.expires_in || 3600) * 1000,
  };
  return _tokenCache.value;
}