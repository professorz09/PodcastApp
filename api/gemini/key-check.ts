import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const hasVertex = !!(process.env.GCP_SA_KEY && process.env.GCP_PROJECT_ID);
  const hasApiKey = !!process.env.GEMINI_API_KEY;
  res.json({
    hasKey: hasVertex || hasApiKey,
    backend: hasVertex ? 'vertex' : hasApiKey ? 'apikey' : 'none',
  });
}