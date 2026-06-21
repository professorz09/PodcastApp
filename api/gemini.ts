import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callGemini } from '../services/vertexProxy.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { model, contents, config: genConfig } = req.body || {};
  if (!model || !contents) {
    return res.status(400).json({ error: 'Missing model or contents in request body.' });
  }

  try {
    const response = await callGemini(model, contents, genConfig);
    // `text` is a prototype getter — explicitly include it so it survives JSON serialization
    return res.json({ ...response, text: response.text ?? null });
  } catch (error: any) {
    console.error('Gemini proxy error:', error);
    const msg = error?.message || 'Gemini API call failed';
    const isQuota = /RESOURCE_EXHAUSTED|429|quota/i.test(msg);
    return res.status(isQuota ? 429 : 500).json({ error: msg });
  }
}