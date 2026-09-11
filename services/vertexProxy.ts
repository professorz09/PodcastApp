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
let cachedProjectId: string | undefined = undefined;
let cachedLocation: string | undefined = undefined;
let cachedCredentials: any = null;

export interface ParsedGcpCredentials {
  project_id: string;
  private_key: string;
  client_email: string;
  [key: string]: any;
}

export function isValidPrivateKey(keyStr: any): boolean {
  if (!keyStr || typeof keyStr !== 'string' || keyStr.length < 50) return false;
  try {
    const normalized = keyStr
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\\\n/g, '\n')
      .replace(/\r\n/g, '\n')
      .trim();
    createPrivateKey(normalized);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bulletproof parser for GCP_SA_KEY:
 * - Handles raw JSON
 * - Handles JSON wrapped in single/double quotes (common from Vercel UI copy-paste)
 * - Handles Base64 encoded service account JSON
 * - Handles unescaped or doubly escaped newlines in the private_key
 * - Returns structured diagnostics so setup issues can be immediately understood
 */
export function parseGcpServiceAccount(rawKey?: string, explicitProjectId?: string): {
  valid: boolean;
  credentials?: ParsedGcpCredentials;
  projectId?: string;
  error?: string;
} {
  if (!rawKey || typeof rawKey !== 'string' || !rawKey.trim()) {
    return { valid: false, error: 'GCP_SA_KEY environment variable is missing or empty.' };
  }

  let str = rawKey.trim();

  // Strip wrapping outer quotes if pasted as string in Vercel UI
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    try {
      const unquoted = JSON.parse(str);
      if (typeof unquoted === 'string') str = unquoted.trim();
      else if (typeof unquoted === 'object' && unquoted !== null) {
        str = JSON.stringify(unquoted);
      }
    } catch {
      str = str.slice(1, -1).trim();
    }
  }

  // Handle Base64-encoded service account key (common in secret managers / CI/CD)
  if (!str.startsWith('{')) {
    try {
      const decoded = Buffer.from(str, 'base64').toString('utf-8');
      if (decoded.trim().startsWith('{')) {
        str = decoded.trim();
      }
    } catch {}
  }

  let obj: any = null;
  try {
    obj = JSON.parse(str);
  } catch (e: any) {
    // If standard JSON.parse fails due to unescaped newlines in private key string, try sanitizing
    try {
      const sanitized = str.replace(/[\r\n]+/g, '\\n');
      obj = JSON.parse(sanitized);
    } catch {
      return {
        valid: false,
        error: `GCP_SA_KEY is not valid JSON (${e?.message || 'parse error'}). Ensure the complete Service Account JSON was pasted.`,
      };
    }
  }

  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch {}
  }

  if (!obj || typeof obj !== 'object') {
    return { valid: false, error: 'GCP_SA_KEY parsed as non-object. Ensure the entire JSON object was provided.' };
  }

  // Determine Project ID (from explicit param, process.env.GCP_PROJECT_ID, or JSON field)
  const projectId = (explicitProjectId || process.env.GCP_PROJECT_ID || obj.project_id || '').trim();
  if (!projectId) {
    return {
      valid: false,
      error: 'Google Cloud Project ID is missing. Add GCP_PROJECT_ID to Vercel or include "project_id" in GCP_SA_KEY.',
    };
  }

  // Extract and normalize Private Key
  let privateKey = obj.private_key;
  if (!privateKey && typeof obj === 'string' && (obj as string).includes('BEGIN PRIVATE KEY')) {
    privateKey = obj;
  }
  if (!privateKey || typeof privateKey !== 'string') {
    return {
      valid: false,
      error: 'GCP_SA_KEY is missing the "private_key" field. Check the Service Account JSON.',
    };
  }

  // Normalize all forms of escaped or literal newlines in private key
  privateKey = privateKey
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim();

  // Validate format and RSA key
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    return {
      valid: false,
      error: 'GCP_SA_KEY private_key must contain "-----BEGIN PRIVATE KEY-----".',
    };
  }

  try {
    createPrivateKey(privateKey);
  } catch (keyErr: any) {
    return {
      valid: false,
      error: `Invalid RSA private key in GCP_SA_KEY: ${keyErr?.message || 'cannot parse key'}. Ensure newlines were not mangled.`,
    };
  }

  const clientEmail = (obj.client_email || process.env.GCP_CLIENT_EMAIL || '').trim();

  return {
    valid: true,
    projectId,
    credentials: {
      ...obj,
      project_id: projectId,
      private_key: privateKey,
      client_email: clientEmail,
    },
  };
}

export function getGeminiClient(): {
  ai: GoogleGenAI;
  mode: 'vertex' | 'apikey';
  projectId?: string;
  location?: string;
  credentials?: any;
} {
  if (cachedClient && cachedMode) {
    return {
      ai: cachedClient,
      mode: cachedMode,
      projectId: cachedProjectId,
      location: cachedLocation,
      credentials: cachedCredentials,
    };
  }

  const saKey = process.env.GCP_SA_KEY;
  const explicitPid = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_REGION || DEFAULT_LOCATION;

  let vertexParseError = '';

  if (saKey) {
    const parsed = parseGcpServiceAccount(saKey, explicitPid);
    if (parsed.valid && parsed.credentials && parsed.projectId) {
      cachedClient = new GoogleGenAI({
        vertexai: true,
        project: parsed.projectId,
        location,
        googleAuthOptions: { credentials: parsed.credentials },
      });
      cachedMode = 'vertex';
      cachedProjectId = parsed.projectId;
      cachedLocation = location;
      cachedCredentials = parsed.credentials;
      return {
        ai: cachedClient,
        mode: 'vertex',
        projectId: cachedProjectId,
        location: cachedLocation,
        credentials: cachedCredentials,
      };
    } else {
      vertexParseError = parsed.error || 'Failed to parse GCP_SA_KEY';
      console.warn(`[VertexProxy] GCP_SA_KEY parse issue: ${vertexParseError}`);
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
    cachedMode = 'apikey';
    return { ai: cachedClient, mode: 'apikey' };
  }

  if (saKey && vertexParseError) {
    throw new Error(`Vertex AI Configuration Error: ${vertexParseError}`);
  }

  throw new Error(
    'No valid Gemini backend configured. Please ensure GCP_SA_KEY and GCP_PROJECT_ID are set in Vercel environment variables, or provide GEMINI_API_KEY.',
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

    // 1. Location fallback: if model is not found in the current location (e.g. global vs us-central1), retry alternate
    if (clientInfo.mode === 'vertex' && clientInfo.credentials && clientInfo.projectId &&
        /not found in location|Publisher Model.*not found|RESOURCE_NOT_FOUND|LOCATION_NOT_SUPPORTED/i.test(msg)) {
      const altLoc = (clientInfo.location || DEFAULT_LOCATION) === 'global' ? 'us-central1' : 'global';
      console.warn(`Vertex AI call failed in ${clientInfo.location} (${msg}). Retrying in ${altLoc}...`);
      try {
        const altClient = new GoogleGenAI({
          vertexai: true,
          project: clientInfo.projectId,
          location: altLoc,
          googleAuthOptions: { credentials: clientInfo.credentials },
        });
        const res = await altClient.models.generateContent({ model, contents: finalContents, config: finalConfig });
        clientInfo.location = altLoc;
        return res;
      } catch (altErr: any) {
        console.warn(`Vertex AI alternate location ${altLoc} also failed:`, altErr.message);
      }
    }

    // 2. Fallback to GEMINI_API_KEY if available
    if (clientInfo.mode === 'vertex' && process.env.GEMINI_API_KEY && !(isImageModel && isQuota)) {
      console.warn(`Vertex AI call failed (${msg}), falling back to GEMINI_API_KEY...`);
      const fallbackAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const isFatalAuth = /unauthenticated|invalid_grant|private.?key|decoder/i.test(msg);
      if (isFatalAuth) {
        cachedClient = fallbackAi;
        cachedMode = 'apikey';
      }
      const safeConfig = sanitizeConfigForApiKey(genConfig);
      return await fallbackAi.models.generateContent({ model, contents: safeConfig });
    }

    // 3. User-friendly explanations for common GCP Vertex AI setup issues
    if (/aiplatform.googleapis.com.*disabled|has not been used in project/i.test(msg)) {
      throw new Error(`Google Cloud Vertex AI API is disabled in project "${clientInfo.projectId}". Please enable "Vertex AI API" (aiplatform.googleapis.com) in GCP Console.`);
    }
    if (/Permission 'aiplatform.endpoints.predict' denied/i.test(msg)) {
      throw new Error(`Permission Denied: Ensure the Service Account has the "Vertex AI User" role in GCP project "${clientInfo.projectId}".`);
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
  const parsed = parseGcpServiceAccount(saKey, process.env.GCP_PROJECT_ID);
  if (!parsed.valid || !parsed.credentials) {
    throw new Error(parsed.error || 'GCP_SA_KEY is invalid or missing');
  }

  const creds = parsed.credentials;
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
  const sig = signer.sign(creds.private_key, 'base64url');
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