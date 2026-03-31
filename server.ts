import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 5000;

  // Increase payload limit for large audio files (e.g., 50mb)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API Routes
  app.get('/api/elevenlabs/voices', async (req, res) => {
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
  });

  app.post('/api/elevenlabs/tts', async (req, res) => {
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
      
      res.set('Content-Type', 'audio/mpeg');
      res.send(buffer);
    } catch (error: any) {
      console.error('ElevenLabs TTS Error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate speech' });
    }
  });

  app.post('/api/google/speech-to-text', async (req, res) => {
    const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GOOGLE_CLOUD_API_KEY is missing' });
    }

    const { audioContent, languageCode = 'en-US', mimeType, sampleRate } = req.body;
    if (!audioContent) {
      return res.status(400).json({ error: 'Missing audioContent' });
    }

    let config: any = {
        languageCode,
        enableWordTimeOffsets: true,
    };

    if (sampleRate) {
      config.sampleRateHertz = sampleRate;
    }

    if (mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') {
        config.encoding = 'MP3';
        if (!config.sampleRateHertz) {
          config.sampleRateHertz = 44100; // Common for MP3, fallback if not provided
        }
    } else if (mimeType === 'audio/wav') {
        config.encoding = 'LINEAR16';
        // WAV files have headers with sample rates. 
        // If we provide a sampleRateHertz that mismatches the header (e.g. 48000 vs 24000), Google errors.
        // Always omit sampleRateHertz for WAV to let Google read the header.
        delete config.sampleRateHertz;
    }

    try {
      const googleResponse = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
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

      const contentType = googleResponse.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await googleResponse.json();
      } else {
        const text = await googleResponse.text();
        console.error(`Google Speech API returned non-JSON response (${googleResponse.status}):`, text);
        throw new Error(`Google Speech API returned non-JSON response: ${text.slice(0, 100)}`);
      }

      if (!googleResponse.ok) {
        const errorMessage = data.error?.message || 'Failed to transcribe';
        console.error(`Google Speech API Error (${googleResponse.status}):`, errorMessage);

        // Check if the error is due to audio length
        // Catch both "Sync input too long" and "Inline audio exceeds duration limit"
        if (googleResponse.status === 400 && (errorMessage.includes('too long') || errorMessage.includes('duration limit'))) {
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

          const lrContentType = longRunningResponse.headers.get('content-type');
          let longRunningData;
          if (lrContentType && lrContentType.includes('application/json')) {
            longRunningData = await longRunningResponse.json();
          } else {
            const text = await longRunningResponse.text();
            throw new Error(`Long Running Recognition returned non-JSON: ${text.slice(0, 100)}`);
          }
          
          if (!longRunningResponse.ok) {
             const lrError = longRunningData.error?.message || 'Failed to start long running recognition';
             console.error('Long Running Recognition Error:', lrError);
             throw new Error(lrError);
          }
          
          console.log('Long running operation started:', longRunningData.name);
          // Return the operation name so the client can poll
          return res.json({ operationName: longRunningData.name });
        }

        throw new Error(errorMessage);
      }

      res.json(data);
    } catch (error: any) {
      console.error('Google Speech API Error:', error);
      res.status(500).json({ error: error.message || 'Failed to transcribe' });
    }
  });

  app.get('/api/google/operations', async (req, res) => {
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

      const googleResponse = await fetch(url);
      const contentType = googleResponse.headers.get('content-type');
      
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await googleResponse.json();
      } else {
        const text = await googleResponse.text();
        console.error(`Google Operations API returned non-JSON response (${googleResponse.status}):`, text);
        throw new Error(`Google Operations API returned non-JSON response: ${text.slice(0, 100)}`);
      }

      if (!googleResponse.ok) {
        throw new Error(data.error?.message || 'Failed to fetch operation status');
      }

      res.json(data);
    } catch (error: any) {
      console.error('Google Operations API Error:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch operation status' });
    }
  });

  // Flask proxy routes — forward YouTube/video/files API calls to Flask on port 8000
  const FLASK_URL = 'http://localhost:8000';
  const flaskRoutes = ['/api/youtube', '/api/video', '/api/files', '/api/health'];

  app.use(flaskRoutes, async (req: any, res: any) => {
    const controller = new AbortController();
    // 3-minute timeout for long operations (video merge, download etc.)
    const timeoutId = setTimeout(() => controller.abort(), 180_000);

    try {
      const targetUrl = `${FLASK_URL}${req.originalUrl}`;
      const contentType = req.headers['content-type'] || '';
      const isMultipart = contentType.includes('multipart/form-data');

      const fetchOptions: any = {
        method: req.method,
        headers: {} as Record<string, string>,
        signal: controller.signal,
      };

      // Forward Range header for video streaming
      if (req.headers['range']) {
        fetchOptions.headers['range'] = req.headers['range'];
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (isMultipart) {
          // Forward content-type (including multipart boundary) and pipe raw body.
          // express.json() does NOT consume multipart streams, so req is still readable.
          fetchOptions.headers['content-type'] = contentType;
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          fetchOptions.body = Buffer.concat(chunks);
        } else {
          // JSON / urlencoded — body already parsed by express.json()
          fetchOptions.headers['content-type'] = contentType || 'application/json';
          fetchOptions.body = JSON.stringify(req.body);
        }
      }

      const flaskRes = await fetch(targetUrl, fetchOptions);
      clearTimeout(timeoutId);

      // Forward response headers
      const ct = flaskRes.headers.get('content-type');
      if (ct) res.setHeader('Content-Type', ct);
      const contentRange = flaskRes.headers.get('content-range');
      const acceptRanges = flaskRes.headers.get('accept-ranges');
      const contentLength = flaskRes.headers.get('content-length');
      if (contentRange) res.setHeader('Content-Range', contentRange);
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
      if (contentLength) res.setHeader('Content-Length', contentLength);

      res.status(flaskRes.status);
      const buffer = await flaskRes.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        res.status(504).json({ error: 'Flask server ne response dene mein bahut waqt liya (timeout).' });
      } else if (err.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNREFUSED') {
        res.status(503).json({ error: 'Flask server chal nahi raha. "Flask Server" workflow start karo.' });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  });

  // Vite Middleware
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: false,
      },
      appType: 'spa',
    });
    // Force no-cache so browser always loads fresh JS after server restart
    app.use((req, res, next) => {
      if (!req.path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      next();
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('{/*path}', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
