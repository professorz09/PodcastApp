import { isValidPrivateKey } from '../../services/vertexProxy';

// Vercel serverless function — mirrors the /api/gemini/key-check route in server.ts
export default function handler(req: any, res: any) {
  let hasVertex = false;
  if (process.env.GCP_SA_KEY) {
    try {
      const creds = JSON.parse(process.env.GCP_SA_KEY);
      const pid = process.env.GCP_PROJECT_ID || creds.project_id;
      hasVertex = !!(pid && creds.private_key && isValidPrivateKey(creds.private_key));
    } catch {
      hasVertex = false;
    }
  }
  const hasApiKey = !!process.env.GEMINI_API_KEY;
  res.json({
    hasKey: hasVertex || hasApiKey,
    backend: hasVertex ? 'vertex' : hasApiKey ? 'apikey' : 'none',
  });
}
