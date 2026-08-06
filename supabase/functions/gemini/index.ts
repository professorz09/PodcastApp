// Supabase Edge Function: /functions/v1/gemini
// Replaces the Vercel serverless function api/gemini.ts — proxies script/text
// generation calls to Vertex AI (Service Account) or the direct Gemini API,
// same backend-selection logic as services/vertexProxy.ts, ported to Deno
// (no Node built-ins, so GCP auth is done with Web Crypto instead of
// node:crypto, and generateContent is called via raw REST instead of the
// @google/genai SDK).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_LOCATION = 'global';

// ── GCP OAuth2 access token via Service Account key (Web Crypto RS256) ──────
let _tokenCache: { value: string; expiresAt: number } | null = null;

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function getGCPAccessToken(): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now + 60_000) return _tokenCache.value;

  const saKey = Deno.env.get('GCP_SA_KEY');
  if (!saKey) throw new Error('GCP_SA_KEY is not set');
  const creds = JSON.parse(saKey);

  const nowSec = Math.floor(now / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify({
    iss: creds.client_email,
    sub: creds.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
  }));
  const signingInput = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    'pkcs8', pemToPkcs8(creds.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(sigBuf))}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(`GCP token error: ${tokenData.error_description || tokenData.error || tokenRes.status}`);
  }

  _tokenCache = { value: tokenData.access_token, expiresAt: now + (tokenData.expires_in || 3600) * 1000 };
  return _tokenCache.value;
}

// ── thinkingConfig translation (Gemini 2.5 wants thinkingBudget, 3.x wants thinkingLevel) ──
function isGemini3(model: string): boolean {
  return /^gemini-3(\.|-)/i.test(model);
}

const THINKING_BUDGET_25: Record<string, number> = { OFF: 0, NONE: 0, MINIMAL: 512, LOW: 1024, MEDIUM: 8192, HIGH: -1 };

function translateThinkingForVertex(model: string, genConfig: any): any {
  if (!genConfig || typeof genConfig !== 'object') return genConfig;
  const tc = genConfig.thinkingConfig;
  if (!tc || typeof tc !== 'object') return genConfig;
  if (isGemini3(model)) return genConfig;
  if (!('thinkingLevel' in tc) || 'thinkingBudget' in tc) return genConfig;
  const level = String(tc.thinkingLevel ?? '').toUpperCase();
  const budget = THINKING_BUDGET_25[level];
  if (budget === undefined) return genConfig;
  const { thinkingLevel: _drop, ...rest } = tc;
  return { ...genConfig, thinkingConfig: { ...rest, thinkingBudget: budget } };
}

// ── contents normalization — REST API requires an explicit role on every entry ──
function looksLikePart(x: any): boolean {
  return !!x && typeof x === 'object' && (
    'text' in x || 'inlineData' in x || 'fileData' in x ||
    'functionCall' in x || 'functionResponse' in x || 'executableCode' in x ||
    'codeExecutionResult' in x || 'thought' in x
  );
}

function normalizeOne(item: any): any {
  if (!item || typeof item !== 'object') return item;
  if (item.role && item.parts) return item;
  if (item.parts && !item.role) return { role: 'user', ...item };
  if (looksLikePart(item)) return { role: 'user', parts: [item] };
  return item;
}

function normalizeContents(contents: any): any {
  if (contents == null) return contents;
  if (typeof contents === 'string') return [{ role: 'user', parts: [{ text: contents }] }];
  if (Array.isArray(contents)) {
    if (contents.length > 0 && contents.every(looksLikePart)) return [{ role: 'user', parts: contents }];
    return contents.map(normalizeOne);
  }
  return [normalizeOne(contents)];
}

// ── config → REST body splitting (tools/safetySettings/systemInstruction are
// top-level siblings of `contents`; everything else nests under generationConfig) ──
const TOP_LEVEL_KEYS = new Set(['tools', 'toolConfig', 'safetySettings', 'systemInstruction', 'cachedContent']);

function buildRequestBody(contents: any, config: any) {
  const body: any = { contents };
  if (!config) return body;
  const generationConfig: any = {};
  for (const [k, v] of Object.entries(config)) {
    if (v === undefined) continue;
    if (TOP_LEVEL_KEYS.has(k)) body[k] = v;
    else generationConfig[k] = v;
  }
  if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;
  return body;
}

const extractQuotaDetail = (data: any): string => {
  const violations = data?.error?.details?.flatMap((d: any) => d?.violations || d?.metadata ? [d] : []) ?? [];
  if (violations.length) return ` [${JSON.stringify(violations)}]`;
  return '';
};

const isQuotaMessage = (msg: string) => /RESOURCE_EXHAUSTED|429|quota/i.test(msg);

async function callVertex(model: string, body: any, projectId: string, location: string): Promise<any> {
  const token = await getGCPAccessToken();
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-goog-user-project': projectId },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    const detail = extractQuotaDetail(data);
    console.error(`[gemini] vertex error ${resp.status}: ${data.error?.message}${detail}`);
    throw new Error(`[vertex] ${data.error?.message || `generateContent error ${resp.status}`}${detail}`);
  }
  return data;
}

async function callApiKey(model: string, body: any, apiKey: string): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json();
  if (!resp.ok) {
    const detail = extractQuotaDetail(data);
    console.error(`[gemini] apikey error ${resp.status}: ${data.error?.message}${detail}`);
    throw new Error(`[apikey] ${data.error?.message || `Gemini API error ${resp.status}`}${detail}`);
  }
  return data;
}

async function callGemini(model: string, contents: any, genConfig: any) {
  const saKey = Deno.env.get('GCP_SA_KEY');
  const projectId = Deno.env.get('GCP_PROJECT_ID');
  const location = Deno.env.get('GCP_REGION') || DEFAULT_LOCATION;
  const apiKey = Deno.env.get('GEMINI_API_KEY');

  const finalConfig = translateThinkingForVertex(model, genConfig);
  const finalContents = normalizeContents(contents);
  const body = buildRequestBody(finalContents, finalConfig);

  // Diagnostic: which backend actually got picked, and why — visible in
  // Supabase edge-function logs (console.log) so we can tell "quota errors
  // after 2 images" apart from "silently on the free API-key tier".
  console.log(`[gemini] backend=${saKey && projectId ? 'vertex' : apiKey ? 'apikey' : 'none'} model=${model} hasSaKey=${!!saKey} hasProjectId=${!!projectId} hasApiKey=${!!apiKey}`);

  if (saKey && projectId) {
    try {
      return await callVertex(model, body, projectId, location);
    } catch (e: any) {
      // Vertex AI and the Gemini Developer API (AI Studio key) are separate
      // quota pools on Google's side — a Vertex 429 doesn't mean the AI
      // Studio key is exhausted too. Only worth falling back on an actual
      // quota error (not e.g. an auth/model-not-found problem), and only if
      // an AI Studio key is even configured.
      if (apiKey && isQuotaMessage(e.message || '')) {
        console.warn(`[gemini] vertex quota-exhausted, falling back to AI Studio key: ${e.message}`);
        try {
          return await callApiKey(model, body, apiKey);
        } catch (e2: any) {
          throw new Error(`${e.message} — AI Studio fallback also failed: ${e2.message}`);
        }
      }
      throw e;
    }
  }

  if (apiKey) return await callApiKey(model, body, apiKey);

  throw new Error('No Gemini backend configured. Set GCP_SA_KEY + GCP_PROJECT_ID (preferred) or GEMINI_API_KEY.');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, 'Content-Type': 'application/json' };

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
  }

  let payload: any;
  try { payload = await req.json(); } catch { payload = {}; }
  const { model, contents, config: genConfig } = payload || {};
  if (!model || !contents) {
    return new Response(JSON.stringify({ error: 'Missing model or contents in request body.' }), { status: 400, headers: jsonHeaders });
  }

  try {
    const response = await callGemini(model, contents, genConfig);
    const parts = response?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p: any) => p.text ?? '').join('').trim();
    return new Response(JSON.stringify({ ...response, text: text || null }), { headers: jsonHeaders });
  } catch (error: any) {
    console.error('Gemini proxy error:', error);
    const msg = error?.message || 'Gemini API call failed';
    const isQuota = /RESOURCE_EXHAUSTED|429|quota/i.test(msg);
    return new Response(JSON.stringify({ error: msg }), { status: isQuota ? 429 : 500, headers: jsonHeaders });
  }
});
