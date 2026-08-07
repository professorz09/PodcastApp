// Supabase Edge Function: /functions/v1/embed
// Text -> embedding vector, used to power real cosine-similarity search
// against our own style pool (public.style_images.embedding), instead of
// LLM-reasoning over raw metadata. Uses whichever Gemini backend this
// project already has configured for everything else (Vertex Service
// Account preferred, AI Studio key as fallback) — same selection logic as
// the `gemini` function, just against the embedding endpoint instead of
// generateContent. Vertex's surface for text-embedding-004 is the older
// `:predict` shape (instances/predictions), not `:embedContent`.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EMBED_MODEL = 'text-embedding-004';
// Embedding models aren't available on the 'global' Vertex endpoint the way
// Gemini 3.x chat/image models are — default to a region that reliably
// serves them when GCP_REGION isn't set to something more specific.
const DEFAULT_EMBED_LOCATION = 'us-central1';

// ── GCP OAuth2 access token via Service Account key (Web Crypto RS256) —
// identical to the `gemini` function's implementation. ──
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

async function embedViaVertex(text: string): Promise<number[]> {
  const projectId = Deno.env.get('GCP_PROJECT_ID');
  if (!projectId) throw new Error('GCP_PROJECT_ID is not set');
  const location = Deno.env.get('GCP_EMBED_REGION') || DEFAULT_EMBED_LOCATION;
  const token = await getGCPAccessToken();
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${EMBED_MODEL}:predict`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-goog-user-project': projectId },
    body: JSON.stringify({ instances: [{ content: text }] }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    console.error('[embed] vertex error', resp.status, data);
    throw new Error(`[vertex] ${data?.error?.message || `predict error ${resp.status}`}`);
  }
  const values: number[] = data?.predictions?.[0]?.embeddings?.values || [];
  if (!values.length) throw new Error('[vertex] No embedding returned');
  return values;
}

async function embedViaApiKey(text: string, apiKey: string): Promise<number[]> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: `models/${EMBED_MODEL}`, content: { parts: [{ text }] } }),
    }
  );
  const data = await resp.json();
  if (!resp.ok) {
    console.error('[embed] apikey error', resp.status, data);
    throw new Error(`[apikey] ${data?.error?.message || `embedContent error ${resp.status}`}`);
  }
  const values: number[] = data?.embedding?.values || [];
  if (!values.length) throw new Error('[apikey] No embedding returned');
  return values;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, 'Content-Type': 'application/json' };

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
  }

  let payload: any;
  try { payload = await req.json(); } catch { payload = {}; }
  const text = (payload?.text || '').toString().slice(0, 8000);
  if (!text.trim()) {
    return new Response(JSON.stringify({ error: 'Missing text' }), { status: 400, headers: jsonHeaders });
  }

  const saKey = Deno.env.get('GCP_SA_KEY');
  const projectId = Deno.env.get('GCP_PROJECT_ID');
  const apiKey = Deno.env.get('GEMINI_API_KEY');

  try {
    let embedding: number[];
    if (saKey && projectId) {
      try {
        embedding = await embedViaVertex(text);
      } catch (e: any) {
        if (apiKey && /RESOURCE_EXHAUSTED|429|quota/i.test(e.message || '')) {
          embedding = await embedViaApiKey(text, apiKey);
        } else {
          throw e;
        }
      }
    } else if (apiKey) {
      embedding = await embedViaApiKey(text, apiKey);
    } else {
      throw new Error('No Gemini backend configured. Set GCP_SA_KEY + GCP_PROJECT_ID (preferred) or GEMINI_API_KEY.');
    }
    return new Response(JSON.stringify({ embedding }), { headers: jsonHeaders });
  } catch (error: any) {
    console.error('embed proxy error:', error);
    const msg = error?.message || 'Embedding failed';
    const isQuota = /RESOURCE_EXHAUSTED|429|quota/i.test(msg);
    return new Response(JSON.stringify({ error: msg }), { status: isQuota ? 429 : 500, headers: jsonHeaders });
  }
});
