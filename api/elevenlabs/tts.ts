import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY is missing' });
  }

  const { text, voiceId } = req.body;
  if (!text || !voiceId) {
    return res.status(400).json({ error: 'Missing text or voiceId' });
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: { message: 'Unknown error' } }));
      throw new Error(error.detail?.message || 'Failed to generate speech');
    }

    // Stream the audio back
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(buffer);
  } catch (error: any) {
    console.error('ElevenLabs TTS Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate speech' });
  }
}
