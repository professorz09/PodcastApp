// Supabase Edge Function: /functions/v1/google-speech-to-text
// Replaces the Vercel serverless function api/google/speech-to-text.ts
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
  const { audioContent, languageCode = 'en-US', mimeType, sampleRate } = payload;
  if (!audioContent) {
    return new Response(JSON.stringify({ error: 'Missing audioContent' }), { status: 400, headers: jsonHeaders });
  }

  const callGoogleSTT = async (url: string, body: object, authHeader: Record<string, string>) => {
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader }, body: JSON.stringify(body) });
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const txt = await resp.text();
      throw new Error(`Google STT returned non-JSON (HTTP ${resp.status}): ${txt.slice(0, 200)}`);
    }
    const data = await resp.json();
    if (!resp.ok) {
      const msg = data.error?.message || data.error?.status || JSON.stringify(data.error) || 'Unknown Google STT error';
      throw new Error(`Google STT error (HTTP ${resp.status}): ${msg}`);
    }
    return data;
  };

  const buildConfig = (enhanced: boolean) => {
    const cfg: any = { languageCode, enableWordTimeOffsets: true };
    if (enhanced) { cfg.model = 'latest_long'; cfg.useEnhanced = true; }
    if (mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') { cfg.encoding = 'MP3'; cfg.sampleRateHertz = sampleRate || 44100; }
    else if (mimeType === 'audio/wav') { cfg.encoding = 'LINEAR16'; }
    else if (sampleRate) { cfg.sampleRateHertz = sampleRate; }
    return cfg;
  };

  const runSTT = async (authHeader: Record<string, string>, urlSuffix: (base: string) => string) => {
    const projectId = Deno.env.get('GCP_PROJECT_ID');
    if (projectId) {
      const v2Url = urlSuffix(`https://speech.googleapis.com/v2/projects/${projectId}/locations/global/recognizers/_:recognize`);
      const v2Body = { config: { autoDecodingConfig: {}, languageCodes: [languageCode], model: 'long', features: { enableWordTimeOffsets: true } }, content: audioContent };
      try {
        const v2Data = await callGoogleSTT(v2Url, v2Body, authHeader);
        if (v2Data.results) {
          v2Data.results.forEach((r: any) => {
            r.alternatives?.[0]?.words?.forEach((w: any) => {
              if (w.startOffset !== undefined) w.startTime = w.startOffset;
              if (w.endOffset !== undefined) w.endTime = w.endOffset;
            });
          });
        }
        return v2Data;
      } catch (v2Err: any) {
        console.warn('STT v2 failed, falling back to v1p1beta1:', v2Err.message);
      }
    }

    const versions = [
      { label: 'v1p1beta1', base: 'https://speech.googleapis.com/v1p1beta1', enhanced: true },
      { label: 'v1', base: 'https://speech.googleapis.com/v1', enhanced: false },
    ];
    let lastErr: Error | null = null;
    for (const ver of versions) {
      try {
        const config = buildConfig(ver.enhanced);
        const url = urlSuffix(`${ver.base}/speech:recognize`);
        const data = await callGoogleSTT(url, { config, audio: { content: audioContent } }, authHeader);
        if (data.error?.message?.includes('too long') || data.error?.message?.includes('duration limit')) {
          const lrUrl = urlSuffix(`${ver.base}/speech:longrunningrecognize`);
          const lrData = await callGoogleSTT(lrUrl, { config, audio: { content: audioContent } }, authHeader);
          return { operationName: lrData.name };
        }
        return data;
      } catch (verErr: any) {
        console.warn(`STT ${ver.label} failed:`, verErr.message);
        lastErr = verErr;
        if (verErr.message?.includes('disabled') || verErr.message?.includes('blocked')) break;
      }
    }

    const rawMsg = lastErr?.message || 'Failed to transcribe audio';
    let helpMsg = rawMsg;
    if (rawMsg.includes('blocked') || rawMsg.includes('API restrictions')) {
      helpMsg = `${rawMsg} — Fix: Go to console.cloud.google.com/apis/credentials → edit your API key → API restrictions → add "Cloud Speech-to-Text API"`;
    } else if (rawMsg.includes('disabled') || rawMsg.includes('has not been used')) {
      helpMsg = `${rawMsg} — Fix: Go to console.developers.google.com/apis/api/speech.googleapis.com/overview and click Enable`;
    } else if (rawMsg.includes('billing') || rawMsg.includes('quota')) {
      helpMsg = `${rawMsg} — Fix: Enable billing for your Google Cloud project at console.cloud.google.com/billing`;
    }
    throw new Error(helpMsg);
  };

  try {
    const token = await getGCPAccessToken();
    const projectId = Deno.env.get('GCP_PROJECT_ID');
    const saHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (projectId) saHeaders['x-goog-user-project'] = projectId;
    const data = await runSTT(saHeaders, (base) => base);
    return new Response(JSON.stringify(data), { headers: jsonHeaders });
  } catch (saErr: any) {
    console.warn('STT SA auth failed, falling back to API key:', saErr.message);
  }

  const apiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'No STT auth available: set GCP_SA_KEY or GOOGLE_CLOUD_API_KEY' }), { status: 500, headers: jsonHeaders });
  }
  try {
    const data = await runSTT({}, (base) => `${base}?key=${apiKey}`);
    return new Response(JSON.stringify(data), { headers: jsonHeaders });
  } catch (error: any) {
    console.error('Google Speech API Error:', error.message);
    return new Response(JSON.stringify({ error: error.message || 'Failed to transcribe audio' }), { status: 500, headers: jsonHeaders });
  }
});
