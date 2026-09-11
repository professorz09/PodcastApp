import { callGemini } from '../services/vertexProxy';

// Allow maximum 60 seconds on Vercel Serverless Functions
export const maxDuration = 60;

// Vercel serverless function — mirrors the /api/gemini route in server.ts
// so dev (Express) and prod (Vercel) run identical Gemini/Vertex proxy logic.
export default async function handler(req: any, res: any) {
  // CORS support
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

    // Google Cloud / GenAI SDK errors often encapsulate JSON within error.message
    try {
      if (typeof msg === 'string' && msg.trim().startsWith('{')) {
        const parsed = JSON.parse(msg);
        if (parsed?.error?.message) {
          msg = parsed.error.message;
        } else if (parsed?.message) {
          msg = parsed.message;
        }
      }
    } catch {}

    const isQuota = /RESOURCE_EXHAUSTED|429|quota/i.test(String(msg));
    return res.status(isQuota ? 429 : 500).json({ error: String(msg) });
  }
}
