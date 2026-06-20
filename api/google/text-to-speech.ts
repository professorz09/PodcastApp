import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getGCPAccessToken } from '../../services/vertexProxy.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { text, voiceName, languageCode = 'en-US' } = req.body;
  if (!text || !voiceName) {
    return res.status(400).json({ error: 'Missing text or voiceName' });
  }

  const fullVoiceName = `${languageCode}-Chirp3-HD-${voiceName}`;
  const ttsBody = JSON.stringify({
    input: { text },
    voice: { languageCode, name: fullVoiceName },
    audioConfig: { audioEncoding: 'MP3' },
  });

  const parseTTSResponse = async (resp: Response) => {
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const raw = await resp.text();
      throw new Error(`Cloud TTS non-JSON response (${resp.status}): ${raw.slice(0, 120)}`);
    }
    const data = await resp.json() as any;
    if (!resp.ok) throw new Error(data.error?.message || `Cloud TTS error ${resp.status}`);
    if (!data.audioContent) throw new Error('No audioContent in Cloud TTS response');
    return data;
  };

  // Try Vertex SA auth first
  try {
    const token = await getGCPAccessToken();
    const ttsResponse = await fetch(
      'https://texttospeech.googleapis.com/v1beta1/text:synthesize',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: ttsBody,
      }
    );
    const data = await parseTTSResponse(ttsResponse);
    return res.json({ audioContent: data.audioContent });
  } catch (saErr: any) {
    console.warn('Cloud TTS SA auth failed, falling back to API key:', saErr.message);
  }

  // Fallback: plain API key
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'No TTS auth available: set GCP_SA_KEY or GOOGLE_CLOUD_API_KEY' });
  }

  try {
    const ttsResponse = await fetch(
      `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ttsBody }
    );
    const data = await parseTTSResponse(ttsResponse);
    res.json({ audioContent: data.audioContent });
  } catch (error: any) {
    console.error('Google Cloud TTS Error:', error);
    res.status(500).json({ error: error.message || 'Failed to synthesize speech' });
  }
}
