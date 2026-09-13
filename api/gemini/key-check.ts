import { parseGcpServiceAccount } from '../../services/vertexProxy.ts';

// Vercel serverless function — mirrors the /api/gemini/key-check route in server.ts
export default function handler(req: any, res: any) {
  let hasVertex = false;
  let vertexError: string | null = null;
  let detectedProjectId: string | undefined = undefined;

  if (process.env.GCP_SA_KEY) {
    const parsed = parseGcpServiceAccount(process.env.GCP_SA_KEY, process.env.GCP_PROJECT_ID);
    hasVertex = parsed.valid;
    detectedProjectId = parsed.projectId;
    if (!parsed.valid) {
      vertexError = parsed.error || 'Failed to parse GCP_SA_KEY';
    }
  }

  const hasApiKey = !!process.env.GEMINI_API_KEY;
  res.json({
    hasKey: hasVertex || hasApiKey,
    backend: hasVertex ? 'vertex' : hasApiKey ? 'apikey' : 'none',
    projectId: detectedProjectId,
    vertexError: hasVertex ? null : vertexError,
  });
}
