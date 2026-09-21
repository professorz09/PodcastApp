// Vercel serverless function — mirrors the /api/google/text-to-speech route
// in server.ts (Google Cloud Text-to-Speech, Chirp 3 HD — Vertex SA auth
// preferred, falls back to a plain API key).
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

  const { text, voiceName, languageCode = 'en-US' } = req.body ?? {};
  if (!text || !voiceName) {
    return res.status(400).json({ error: 'Missing text or voiceName' });
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
    const data = await resp.json() as any;
    if (!resp.ok) throw new Error(data.error?.message || `Cloud TTS error ${resp.status}`);
    if (!data.audioContent) throw new Error('No audioContent in Cloud TTS response');
    return data;
  };

  try {
    const token = await getGCPAccessToken();
    const projectId = process.env.GCP_PROJECT_ID;
    const saHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
    if (projectId) saHeaders['x-goog-user-project'] = projectId;
    console.log('Cloud TTS: using Vertex SA auth');
    const ttsResponse = await fetch(
      'https://texttospeech.googleapis.com/v1/text:synthesize',
      { method: 'POST', headers: saHeaders, body: ttsBody }
    );
    const data = await parseTTSResponse(ttsResponse);
    return res.json({ audioContent: data.audioContent });
  } catch (saErr: any) {
    console.warn('Cloud TTS SA auth failed, falling back to API key:', saErr.message);
  }

  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'No TTS auth available: set GCP_SA_KEY or GOOGLE_CLOUD_API_KEY' });
  }
  try {
    const ttsResponse = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ttsBody }
    );
    const data = await parseTTSResponse(ttsResponse);
    res.json({ audioContent: data.audioContent });
  } catch (error: any) {
    console.error('Google Cloud TTS Error:', error);
    res.status(500).json({ error: error.message || 'Failed to synthesize speech' });
  }
}
