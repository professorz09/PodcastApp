// Vercel serverless function — mirrors the /api/google/operations route in
// server.ts (polls a Google Speech long-running-operation by name).
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
    const { getGCPAccessToken } = await import('../../services/vertexProxy');
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
