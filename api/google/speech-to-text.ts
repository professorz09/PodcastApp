import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_CLOUD_API_KEY is missing' });
  }

  const { audioContent, languageCode = 'en-US', mimeType } = req.body;
  if (!audioContent) {
    return res.status(400).json({ error: 'Missing audioContent' });
  }

  let config: any = {
      languageCode,
      enableWordTimeOffsets: true,
  };

  if (languageCode === 'hi-IN') {
      config.alternativeLanguageCodes = ['en-IN'];
  }

  if (mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') {
      config.encoding = 'MP3';
      config.sampleRateHertz = 44100; // Common for MP3
  } else if (mimeType === 'audio/wav') {
      config.encoding = 'LINEAR16';
      config.sampleRateHertz = 24000; // Match Gemini TTS output
  }

  try {
    const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        config,
        audio: {
          content: audioContent
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      // Check if the error is due to audio length
      if (response.status === 400 && data.error?.message?.includes('too long')) {
        console.log('Audio too long for sync recognition, falling back to longRunningRecognize');
        
        const longRunningResponse = await fetch(`https://speech.googleapis.com/v1/speech:longrunningrecognize?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            config,
            audio: {
              content: audioContent
            }
          })
        });

        const longRunningData = await longRunningResponse.json();
        
        if (!longRunningResponse.ok) {
           throw new Error(longRunningData.error?.message || 'Failed to start long running recognition');
        }
        
        // Return the operation name so the client can poll
        return res.json({ operationName: longRunningData.name });
      }
      
      throw new Error(data.error?.message || 'Failed to transcribe');
    }

    res.json(data);
  } catch (error: any) {
    console.error('Google Speech API Error:', error);
    res.status(500).json({ error: error.message || 'Failed to transcribe' });
  }
}
