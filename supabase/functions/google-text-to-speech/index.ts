// Supabase Edge Function: /functions/v1/google-text-to-speech
// Replaces the Vercel serverless function api/google/text-to-speech.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(creds.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(sigBuf))}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`GCP token error: ${tokenData.error_description || tokenData.error || tokenRes.status}`);
  _tokenCache = { value: tokenData.access_token, expiresAt: now + (tokenData.expires_in || 3600) * 1000 };
  return _tokenCache.value;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, 'Content-Type': 'application/json' };

  let payload: any;
  try { payload = await req.json(); } catch { payload = {}; }
  const { text, voiceName, languageCode = 'en-US' } = payload;
  if (!text || !voiceName) {
    return new Response(JSON.stringify({ error: 'Missing text or voiceName' }), { status: 400, headers: jsonHeaders });
  }

  const fullVoiceName = `${languageCode}-Chirp3-HD-${voiceName}`;
  const ttsBody = JSON.stringify({
    input: { text },
    voice: { languageCode, name: fullVoiceName },
    audioConfig: { audioEncoding: 'MP3' },
  });

  const parseTTSResponse = async (resp: Response) => {
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const raw = await resp.text();
      throw new Error(`Cloud TTS non-JSON response (${resp.status}): ${raw.slice(0, 120)}`);
    }
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || `Cloud TTS error ${resp.status}`);
    if (!data.audioContent) throw new Error('No audioContent in Cloud TTS response');
    return data;
  };

  try {
    const token = await getGCPAccessToken();
    const projectId = Deno.env.get('GCP_PROJECT_ID');
    const saHeaders: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    if (projectId) saHeaders['x-goog-user-project'] = projectId;
    const ttsResponse = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', { method: 'POST', headers: saHeaders, body: ttsBody });
    const data = await parseTTSResponse(ttsResponse);
    return new Response(JSON.stringify({ audioContent: data.audioContent }), { headers: jsonHeaders });
  } catch (saErr: any) {
    console.warn('Cloud TTS SA auth failed, falling back to API key:', saErr.message);
  }

  const apiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'No TTS auth available: set GCP_SA_KEY or GOOGLE_CLOUD_API_KEY' }), { status: 500, headers: jsonHeaders });
  }

  try {
    const ttsResponse = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ttsBody });
    const data = await parseTTSResponse(ttsResponse);
    return new Response(JSON.stringify({ audioContent: data.audioContent }), { headers: jsonHeaders });
  } catch (error: any) {
    console.error('Google Cloud TTS Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Failed to synthesize speech' }), { status: 500, headers: jsonHeaders });
  }
});
