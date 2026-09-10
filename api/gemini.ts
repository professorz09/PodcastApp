// Vercel serverless function — mirrors the /api/gemini route in server.ts
// so dev (Express) and prod (Vercel) run identical Gemini/Vertex proxy logic.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { model, contents, config: genConfig } = req.body ?? {};
  if (!model || !contents) {
    return res.status(400).json({ error: 'Missing model or contents in request body.' });
  }
  try {
    const { callGemini } = await import('../services/vertexProxy');
    const response = await callGemini(model, contents, genConfig);
    res.json(response);
  } catch (error: any) {
    console.error('Gemini proxy error:', error);
    const msg = error?.message || 'Gemini API call failed';
    const isQuota = /RESOURCE_EXHAUSTED|429|quota/i.test(msg);
    res.status(isQuota ? 429 : 500).json({ error: msg });
  }
}
