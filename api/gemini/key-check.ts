// Vercel serverless function — mirrors the /api/gemini/key-check route in server.ts
export default function handler(req: any, res: any) {
  const hasVertex = !!(process.env.GCP_SA_KEY && process.env.GCP_PROJECT_ID);
  const hasApiKey = !!process.env.GEMINI_API_KEY;
  res.json({
    hasKey: hasVertex || hasApiKey,
    backend: hasVertex ? 'vertex' : hasApiKey ? 'apikey' : 'none',
  });
}
