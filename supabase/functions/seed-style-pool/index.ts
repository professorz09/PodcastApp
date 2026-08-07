// Supabase Edge Function: /functions/v1/seed-style-pool
// One-time (batchable, idempotent) job: copies the sister "Podcastflux"
// project's curated style_images pool (public, anon-readable) into this
// project's OWN style_images table + 'styles' bucket, generating a FRESH
// embedding for each image via our own Gemini backend (their original
// embedding model is unknown, so their vectors aren't reusable/comparable
// to a query embedded by us). Once seeded, thumbnail generation runs real
// cosine-similarity search against OUR pool via public.match_styles(),
// independent of the sister project's uptime.
//
// Call with { offset, limit } to page through the ~111-row source pool —
// each row does a download + upload + embed + insert, so small batches
// (limit ~15-20) keep well inside the edge function time budget. Safe to
// re-run: rows already present with a non-null embedding are skipped.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SOURCE_URL = 'https://vowgdlbvundorxwjdntu.supabase.co';
const SOURCE_ANON_KEY = 'sb_publishable_8b-sv6g_bPqHRtL1LBin2g_f-yB_zAa';
const SOURCE_BUCKET = 'styles';

const EMBED_MODEL = 'text-embedding-004';
const DEFAULT_EMBED_LOCATION = 'us-central1';

// ── GCP OAuth2 access token — identical to the `gemini`/`embed` functions ──
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
    iss: creds.client_email, sub: creds.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec, exp: nowSec + 3600,
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
  if (!tokenRes.ok) throw new Error(`GCP token error: ${tokenData.error_description || tokenData.error || tokenRes.status}`);
  _tokenCache = { value: tokenData.access_token, expiresAt: now + (tokenData.expires_in || 3600) * 1000 };
  return _tokenCache.value;
}

async function embedViaVertex(text: string): Promise<number[]> {
  const projectId = Deno.env.get('GCP_PROJECT_ID')!;
  const location = Deno.env.get('GCP_EMBED_REGION') || DEFAULT_EMBED_LOCATION;
  const token = await getGCPAccessToken();
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${EMBED_MODEL}:predict`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-goog-user-project': projectId },
    body: JSON.stringify({ instances: [{ content: text }] }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`[vertex] ${data?.error?.message || `predict error ${resp.status}`}`);
  const values: number[] = data?.predictions?.[0]?.embeddings?.values || [];
  if (values.length) return values;
  throw new Error('[vertex] No embedding returned');
}

async function embedViaApiKey(text: string, apiKey: string): Promise<number[]> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: `models/${EMBED_MODEL}`, content: { parts: [{ text }] } }) }
  );
  const data = await resp.json();
  if (!resp.ok) throw new Error(`[apikey] ${data?.error?.message || `embedContent error ${resp.status}`}`);
  const values: number[] = data?.embedding?.values || [];
  if (values.length) return values;
  throw new Error('[apikey] No embedding returned');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isQuotaError = (msg: string) => /quota|429|RESOURCE_EXHAUSTED/i.test(msg);

// The Vertex `textembedding-gecko` base-model quota this project has is
// tight enough that firing rows back-to-back trips it after just a couple
// of calls. On a quota error, fall back to the AI Studio key (a separate
// quota pool, and a much higher one — 100 RPM vs Vertex's handful) instead
// of just retrying the same exhausted Vertex quota.
async function embedWithRetry(text: string): Promise<number[]> {
  const projectId = Deno.env.get('GCP_PROJECT_ID');
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (projectId) {
    try {
      return await embedViaVertex(text);
    } catch (e: any) {
      if (apiKey && isQuotaError(e?.message || '')) return await embedViaApiKey(text, apiKey);
      if (isQuotaError(e?.message || '')) { await sleep(20000); return await embedViaVertex(text); }
      throw e;
    }
  }
  if (apiKey) return await embedViaApiKey(text, apiKey);
  throw new Error('No Gemini backend configured.');
}

interface SourceRow { path: string; name: string | null; meta: any }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, 'Content-Type': 'application/json' };
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY' }), { status: 500, headers: jsonHeaders });
  }

  let payload: any;
  try { payload = await req.json(); } catch { payload = {}; }
  const offset = Number(payload?.offset) || 0;
  const limit = Math.min(Number(payload?.limit) || 10, 12);

  const results = { processed: 0, copied: 0, skipped: 0, failed: [] as { path: string; error: string }[] };

  try {
    // 1) Page of source rows from Podcastflux.
    const sourceResp = await fetch(
      `${SOURCE_URL}/rest/v1/style_images?select=path,name,meta&path=like.admin/*&active=eq.true&show_in_picker=eq.true&user_id=is.null&order=created_at.asc&offset=${offset}&limit=${limit}`,
      { headers: { apikey: SOURCE_ANON_KEY, Authorization: `Bearer ${SOURCE_ANON_KEY}` } }
    );
    if (!sourceResp.ok) throw new Error(`source fetch failed: ${sourceResp.status}`);
    const rows: SourceRow[] = await sourceResp.json();

    for (const row of rows) {
      results.processed++;
      try {
        // Skip if already copied with an embedding.
        const existingResp = await fetch(
          `${supabaseUrl}/rest/v1/style_images?select=id,embedding&path=eq.${encodeURIComponent(row.path)}&limit=1`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        );
        const existing = existingResp.ok ? await existingResp.json() : [];
        if (existing?.[0]?.embedding) { results.skipped++; continue; }

        // Download the image from the source pool's public bucket.
        const imgResp = await fetch(`${SOURCE_URL}/storage/v1/object/public/${SOURCE_BUCKET}/${row.path}`);
        if (!imgResp.ok) throw new Error(`image download failed: ${imgResp.status}`);
        const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
        const bytes = new Uint8Array(await imgResp.arrayBuffer());

        // Upload it into our own bucket at the same path.
        const upResp = await fetch(`${supabaseUrl}/storage/v1/object/styles/${row.path}`, {
          method: 'POST',
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': contentType, 'x-upsert': 'true' },
          body: bytes,
        });
        if (!upResp.ok) throw new Error(`upload failed: ${upResp.status} ${await upResp.text()}`);

        // Embed a text summary of the image via our own Gemini backend.
        const meta = row.meta || {};
        const embedInput = [row.name, meta.niche, meta.summary, Array.isArray(meta.keywords) ? meta.keywords.join(' ') : '', meta.composition]
          .filter(Boolean).join('. ').slice(0, 2000) || row.path;
        const embedding = await embedWithRetry(embedInput);

        // Upsert the row (path, name, meta, embedding) into our own table.
        const insResp = await fetch(`${supabaseUrl}/rest/v1/style_images?on_conflict=path`, {
          method: 'POST',
          headers: {
            apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify([{ path: row.path, name: row.name, meta: row.meta, embedding, active: true }]),
        });
        if (!insResp.ok) throw new Error(`insert failed: ${insResp.status} ${await insResp.text()}`);

        results.copied++;
        await sleep(6000); // stay well under the tight embedding-model quota
      } catch (e: any) {
        results.failed.push({ path: row.path, error: e?.message || String(e) });
      }
    }

    return new Response(JSON.stringify({ ...results, nextOffset: offset + rows.length, done: rows.length < limit }), { headers: jsonHeaders });
  } catch (error: any) {
    console.error('seed-style-pool error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Seed failed', ...results }), { status: 500, headers: jsonHeaders });
  }
});
