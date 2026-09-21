// Vercel serverless function — mirrors the /api/google/operations route in
// server.ts (polls a Google Speech long-running-operation by name).
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
  const { name } = req.query ?? {};
  if (!name) {
    return res.status(400).json({ error: 'Missing operation name' });
  }

  const nameStr = String(name);
  const baseUrl = nameStr.includes('/')
    ? `https://speech.googleapis.com/v1p1beta1/${nameStr}`
    : `https://speech.googleapis.com/v1p1beta1/operations/${nameStr}`;

  const fetchOp = async (url: string, headers: Record<string, string> = {}) => {
    const googleResponse = await fetch(url, { headers });
    const contentType = googleResponse.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      const text = await googleResponse.text();
      throw new Error(`Google Operations API returned non-JSON (${googleResponse.status}): ${text.slice(0, 100)}`);
    }
    const data = await googleResponse.json() as any;
    if (!googleResponse.ok) throw new Error(data.error?.message || 'Failed to fetch operation status');
    return data;
  };

  try {
    const token = await getGCPAccessToken();
    const projectId = process.env.GCP_PROJECT_ID;
    const saHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (projectId) saHeaders['x-goog-user-project'] = projectId;
    const data = await fetchOp(baseUrl, saHeaders);
    return res.json(data);
  } catch (saErr: any) {
    console.warn('Operations SA auth failed, falling back to API key:', saErr.message);
  }

  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'No auth available: set GCP_SA_KEY or GOOGLE_CLOUD_API_KEY' });
  }
  try {
    const data = await fetchOp(`${baseUrl}?key=${apiKey}`);
    res.json(data);
  } catch (error: any) {
    console.error('Google Operations API Error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch operation status' });
  }
}
