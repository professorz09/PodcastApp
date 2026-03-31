import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_CLOUD_API_KEY is missing' });
  }

  const { name } = req.query;
  if (!name) {
    return res.status(400).json({ error: 'Missing operation name' });
  }

  try {
    let url = `https://speech.googleapis.com/v1/operations/${name}?key=${apiKey}`;
    
    // If the name is a full resource path (e.g. projects/...), use it directly
    if (String(name).includes('/')) {
        url = `https://speech.googleapis.com/v1/${name}?key=${apiKey}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to fetch operation status');
    }

    res.json(data);
  } catch (error: any) {
    console.error('Google Operations API Error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch operation status' });
  }
}
