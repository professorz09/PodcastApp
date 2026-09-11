import { GoogleGenAI } from '@google/genai';
import { createPrivateKey } from 'crypto';

// Allow maximum 60 seconds on Vercel Serverless Functions
export const maxDuration = 60;

const DEFAULT_LOCATION = 'global';

let cachedClient: GoogleGenAI | null = null;
let cachedMode: 'vertex' | 'apikey' | null = null;
let cachedProjectId: string | undefined = undefined;
let cachedLocation: string | undefined = undefined;
let cachedCredentials: any = null;

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

function getGeminiClient(): {
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

function translateThinkingForVertex(model: string, genConfig: any): any {
  if (!genConfig || typeof genConfig !== 'object') return genConfig;
  const tc = genConfig.thinkingConfig;
  if (!tc || typeof tc !== 'object') return genConfig;
  if (isGemini3(model)) return genConfig;
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
  if (typeof contents === 'string') return contents;
  if (Array.isArray(contents)) {
    if (contents.length > 0 && contents.every(looksLikePart)) {
      return [{ role: 'user', parts: contents }];
    }
    return contents.map(normalizeOne);
  }
  return normalizeOne(contents);
}

function sanitizeConfigForApiKey(genConfig: any): any {
  if (!genConfig || typeof genConfig !== 'object') return genConfig;
  const copy = { ...genConfig };
  if (copy.imageConfig && typeof copy.imageConfig === 'object') {
    const { personGeneration: _drop, ...restImageConfig } = copy.imageConfig;
    copy.imageConfig = restImageConfig;
  }
  return copy;
}

async function callGemini(model: string, contents: any, genConfig: any) {
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

    if (clientInfo.mode === 'vertex' && process.env.GEMINI_API_KEY && !(isImageModel && isQuota)) {
      console.warn(`Vertex AI call failed (${msg}), falling back to GEMINI_API_KEY...`);
      const fallbackAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const isFatalAuth = /unauthenticated|invalid_grant|private.?key|decoder/i.test(msg);
      if (isFatalAuth) {
        cachedClient = fallbackAi;
        cachedMode = 'apikey';
      }
      const safeConfig = sanitizeConfigForApiKey(genConfig);
      return await fallbackAi.models.generateContent({ model, contents: finalContents, config: safeConfig });
    }

    if (/aiplatform.googleapis.com.*disabled|has not been used in project/i.test(msg)) {
      throw new Error(`Google Cloud Vertex AI API is disabled in project "${clientInfo.projectId}". Please enable "Vertex AI API" (aiplatform.googleapis.com) in GCP Console.`);
    }
    if (/Permission 'aiplatform.endpoints.predict' denied/i.test(msg)) {
      throw new Error(`Permission Denied: Ensure the Service Account has the "Vertex AI User" role in GCP project "${clientInfo.projectId}".`);
    }

    throw error;
  }
}

// Vercel serverless function — mirrors the /api/gemini route in server.ts
// so dev (Express) and prod (Vercel) run identical Gemini/Vertex proxy logic.
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const { model, contents, config: genConfig } = body ?? {};
  if (!model || !contents) {
    return res.status(400).json({ error: 'Missing model or contents in request body.' });
  }

  try {
    const response = await callGemini(model, contents, genConfig);
    return res.status(200).json(response);
  } catch (error: any) {
    console.error('Gemini proxy error:', error);
    let msg = error?.message || 'Gemini API call failed';
    let statusCode = 500;

    if (typeof error?.status === 'number' && error.status >= 400 && error.status < 600) {
      statusCode = error.status;
    } else if (typeof error?.code === 'number' && error.code >= 400 && error.code < 600) {
      statusCode = error.code;
    }

    try {
      if (typeof msg === 'string' && (msg.trim().startsWith('{') || msg.trim().startsWith('['))) {
        const parsed = JSON.parse(msg);
        if (parsed?.error?.message) {
          msg = parsed.error.message;
          if (parsed.error.code && typeof parsed.error.code === 'number' && parsed.error.code >= 400 && parsed.error.code < 600) {
            statusCode = parsed.error.code;
          }
        } else if (parsed?.message) {
          msg = parsed.message;
        }
      }
    } catch {}

    const isQuota = /RESOURCE_EXHAUSTED|429|quota/i.test(String(msg));
    if (isQuota) statusCode = 429;
    return res.status(statusCode).json({ error: String(msg) });
  }
}
