import { callGemini } from '../services/vertexProxy.ts';

// Allow maximum 60 seconds on Vercel Serverless Functions
export const maxDuration = 60;

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
