// Vercel serverless function — mirrors the /api/google/speech-to-text route
// in server.ts (Vertex SA auth preferred, falls back to a plain API key;
// tries STT v2 first, then v1p1beta1/v1, with a long-running fallback for
// audio that's too long for the sync endpoint).
//
// NOTE: duplicates services/vertexProxy.ts's GCP auth helpers instead of
// importing them — see api/gemini.ts for why (Vercel doesn't reliably
// bundle/trace local .ts sibling imports for this project's Node functions).
import { createSign, createPrivateKey } from 'crypto';

interface ParsedGcpCredentials {
  project_id: string;
  private_key: string;
  client_email: string;
  [key: string]: any;
}

function parseGcpServiceAccount(rawKey?: string, explicitProjectId?: string): {
  valid: boolean;
  credentials?: ParsedGcpCredentials;
  projectId?: string;
  error?: string;
} {
  if (!rawKey || typeof rawKey !== 'string' || !rawKey.trim()) {
    return { valid: false, error: 'GCP_SA_KEY environment variable is missing or empty.' };
  }

  let str = rawKey.trim();

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

  const projectId = (explicitProjectId || process.env.GCP_PROJECT_ID || obj.project_id || '').trim();
  if (!projectId) {
    return {
      valid: false,
      error: 'Google Cloud Project ID is missing. Add GCP_PROJECT_ID to Vercel or include "project_id" in GCP_SA_KEY.',
    };
  }

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

  privateKey = privateKey
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim();

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

let _tokenCache: { value: string; expiresAt: number } | null = null;

async function getGCPAccessToken(): Promise<string> {
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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { audioContent, languageCode = 'en-US', mimeType, sampleRate } = req.body ?? {};
  if (!audioContent) {
    return res.status(400).json({ error: 'Missing audioContent' });
  }

  const callGoogleSTT = async (url: string, body: object, authHeader: Record<string, string>) => {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(body),
    });
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const txt = await resp.text();
      throw new Error(`Google STT returned non-JSON (HTTP ${resp.status}): ${txt.slice(0, 200)}`);
    }
    const data = await resp.json() as any;
    if (!resp.ok) {
      const msg = data.error?.message || data.error?.status || JSON.stringify(data.error) || 'Unknown Google STT error';
      throw new Error(`Google STT error (HTTP ${resp.status}): ${msg}`);
    }
    return data;
  };

  const buildConfig = (enhanced: boolean) => {
    const cfg: any = { languageCode, enableWordTimeOffsets: true };
    if (enhanced) { cfg.model = 'latest_long'; cfg.useEnhanced = true; }
    if (mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') {
      cfg.encoding = 'MP3'; cfg.sampleRateHertz = sampleRate || 44100;
    } else if (mimeType === 'audio/wav') {
      cfg.encoding = 'LINEAR16';
    } else if (sampleRate) {
      cfg.sampleRateHertz = sampleRate;
    }
    return cfg;
  };

  const runSTT = async (authHeader: Record<string, string>, urlSuffix: (base: string) => string) => {
    const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

    if (projectId) {
      console.log(`Using Google STT v2 (project: ${projectId})`);
      const v2Url = urlSuffix(`https://speech.googleapis.com/v2/projects/${projectId}/locations/global/recognizers/_:recognize`);
      const v2Body = {
        config: {
          autoDecodingConfig: {},
          languageCodes: [languageCode],
          model: 'long',
          features: { enableWordTimeOffsets: true },
        },
        content: audioContent,
      };
      try {
        const v2Data = await callGoogleSTT(v2Url, v2Body, authHeader);
        if (v2Data.results) {
          v2Data.results.forEach((r: any) => {
            r.alternatives?.[0]?.words?.forEach((w: any) => {
              if (w.startOffset !== undefined) w.startTime = w.startOffset;
              if (w.endOffset !== undefined)   w.endTime   = w.endOffset;
            });
          });
        }
        return v2Data;
      } catch (v2Err: any) {
        console.warn('STT v2 failed, falling back to v1p1beta1:', v2Err.message);
      }
    }

    const versions = [
      { label: 'v1p1beta1', base: 'https://speech.googleapis.com/v1p1beta1', enhanced: true  },
      { label: 'v1',        base: 'https://speech.googleapis.com/v1',        enhanced: false },
    ];

    let lastErr: Error | null = null;
    for (const ver of versions) {
      try {
        console.log(`Trying Google STT ${ver.label}`);
        const config = buildConfig(ver.enhanced);
        const url = urlSuffix(`${ver.base}/speech:recognize`);
        const data = await callGoogleSTT(url, { config, audio: { content: audioContent } }, authHeader);

        if (data.error?.message?.includes('too long') || data.error?.message?.includes('duration limit')) {
          const lrUrl = urlSuffix(`${ver.base}/speech:longrunningrecognize`);
          const lrData = await callGoogleSTT(lrUrl, { config, audio: { content: audioContent } }, authHeader);
          console.log('Long-running operation started:', lrData.name);
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
    const projectId = process.env.GCP_PROJECT_ID;
    const saHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (projectId) saHeaders['x-goog-user-project'] = projectId;
    console.log('STT: using Vertex SA auth');
    const data = await runSTT(saHeaders, (base) => base);
    return res.json(data);
  } catch (saErr: any) {
    console.warn('STT SA auth failed, falling back to API key:', saErr.message);
  }

  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'No STT auth available: set GCP_SA_KEY or GOOGLE_CLOUD_API_KEY' });
  }
  try {
    const data = await runSTT({}, (base) => `${base}?key=${apiKey}`);
    res.json(data);
  } catch (error: any) {
    console.error('Google Speech API Error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to transcribe audio' });
  }
}
