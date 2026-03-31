import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY is missing' });
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': apiKey
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs API Error:', error);
      return res.status(response.status).json({ error: 'Failed to fetch voices from ElevenLabs' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('ElevenLabs Voices Error:', error);
    res.status(500).json({ error: 'Failed to fetch voices' });
  }
}
