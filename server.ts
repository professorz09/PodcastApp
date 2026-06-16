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
      return res.status(500).json({ error: 'GOOGLE_CLOUD_API_KEY environment variable is not set. Please add it in Secrets.' });
    }

    const { audioContent, languageCode = 'en-US', mimeType, sampleRate } = req.body;
    if (!audioContent) {
      return res.status(400).json({ error: 'Missing audioContent' });
    }

    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

    // ── Helper: call Google STT and return parsed JSON ─────────────────────
    const callGoogleSTT = async (url: string, body: object) => {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        const txt = await resp.text();
        throw new Error(`Google STT returned non-JSON (HTTP ${resp.status}): ${txt.slice(0, 200)}`);
      }
      const data = await resp.json();
      if (!resp.ok) {
        const msg = data.error?.message || data.error?.status || JSON.stringify(data.error) || 'Unknown Google STT error';
        throw new Error(`Google STT error (HTTP ${resp.status}): ${msg}`);
      }
      return data;
    };

    try {
      // ── Try Speech-to-Text v2 first if project ID is available ───────────
      if (projectId) {
        console.log(`Using Google STT v2 (project: ${projectId})`);
        const v2Url = `https://speech.googleapis.com/v2/projects/${projectId}/locations/global/recognizers/_:recognize?key=${apiKey}`;
        const v2Body = {
          config: {
            autoDecodingConfig: {},
            languageCodes: [languageCode],
            model: 'long',
            features: { enableWordTimeOffsets: true },
          },
          content: audioContent,
        };
        try {
          const v2Data = await callGoogleSTT(v2Url, v2Body);
          // v2 returns startOffset/endOffset — normalise to v1 shape for client
          if (v2Data.results) {
            v2Data.results.forEach((r: any) => {
              r.alternatives?.[0]?.words?.forEach((w: any) => {
                // v2 uses startOffset/endOffset (e.g. "1.200s"); map to startTime/endTime
                if (w.startOffset !== undefined) w.startTime = w.startOffset;
                if (w.endOffset !== undefined)   w.endTime   = w.endOffset;
              });
            });
          }
          return res.json(v2Data);
        } catch (v2Err: any) {
          console.warn('STT v2 failed, falling back to v1p1beta1:', v2Err.message);
        }
      }

      // ── Try v1p1beta1, then fall back to plain v1 ───────────────────────
      const buildConfig = (enhanced: boolean) => {
        const cfg: any = { languageCode, enableWordTimeOffsets: true };
        if (enhanced) { cfg.model = 'latest_long'; cfg.useEnhanced = true; }
        if (mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') {
          cfg.encoding = 'MP3'; cfg.sampleRateHertz = sampleRate || 44100;
        } else if (mimeType === 'audio/wav') {
          cfg.encoding = 'LINEAR16'; // omit sampleRateHertz — let Google read WAV header
        } else if (sampleRate) {
          cfg.sampleRateHertz = sampleRate;
        }
        return cfg;
      };

      const versions = [
        { label: 'v1p1beta1', base: 'https://speech.googleapis.com/v1p1beta1', enhanced: true  },
        { label: 'v1',        base: 'https://speech.googleapis.com/v1',        enhanced: false },
      ];

      let lastErr: Error | null = null;
      for (const ver of versions) {
        try {
          console.log(`Trying Google STT ${ver.label}`);
          const config = buildConfig(ver.enhanced);
          const url = `${ver.base}/speech:recognize?key=${apiKey}`;
          const data = await callGoogleSTT(url, { config, audio: { content: audioContent } });

          // Handle "too long" → long-running
          if (data.error?.message?.includes('too long') || data.error?.message?.includes('duration limit')) {
            const lrUrl = `${ver.base}/speech:longrunningrecognize?key=${apiKey}`;
            const lrData = await callGoogleSTT(lrUrl, { config, audio: { content: audioContent } });
            console.log('Long-running operation started:', lrData.name);
            return res.json({ operationName: lrData.name });
          }

          return res.json(data);
        } catch (verErr: any) {
          console.warn(`STT ${ver.label} failed:`, verErr.message);
          lastErr = verErr;
          // If it's a key-restriction or API-disabled error, no point retrying other versions
          if (verErr.message?.includes('disabled') || verErr.message?.includes('blocked')) break;
        }
      }

      // Build a helpful error with fix instructions
      const rawMsg = lastErr?.message || 'Failed to transcribe audio';
      let helpMsg = rawMsg;
      if (rawMsg.includes('blocked') || rawMsg.includes('API restrictions')) {
        helpMsg = `${rawMsg} — Fix: Go to console.cloud.google.com/apis/credentials → edit your API key → API restrictions → add "Cloud Speech-to-Text API"`;
      } else if (rawMsg.includes('disabled') || rawMsg.includes('has not been used')) {
        helpMsg = `${rawMsg} — Fix: Go to console.developers.google.com/apis/api/speech.googleapis.com/overview and click Enable`;
      } else if (rawMsg.includes('billing') || rawMsg.includes('quota')) {
        helpMsg = `${rawMsg} — Fix: Enable billing for your Google Cloud project at console.cloud.google.com/billing`;
      }
      throw new Error(helpMsg);
    } catch (error: any) {
      console.error('Google Speech API Error:', error.message);
      res.status(500).json({ error: error.message || 'Failed to transcribe audio' });
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
      let url = `https://speech.googleapis.com/v1p1beta1/operations/${name}?key=${apiKey}`;
      
      // If the name is a full resource path (e.g. projects/...), use it directly
      if (String(name).includes('/')) {
          url = `https://speech.googleapis.com/v1p1beta1/${name}?key=${apiKey}`;
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

  // ── Google Cloud Text-to-Speech (Chirp 3 HD) ────────────────────────────
  app.post('/api/google/text-to-speech', async (req, res) => {
    const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GOOGLE_CLOUD_API_KEY is missing' });
    }

    const { text, voiceName, languageCode = 'en-US' } = req.body;
    if (!text || !voiceName) {
      return res.status(400).json({ error: 'Missing text or voiceName' });
    }

    const fullVoiceName = `${languageCode}-Chirp3-HD-${voiceName}`;

    try {
      const ttsResponse = await fetch(
        `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text },
            voice: { languageCode, name: fullVoiceName },
            audioConfig: { audioEncoding: 'MP3' },
          }),
        }
      );

      const contentType = ttsResponse.headers.get('content-type');
      let data: any;
      if (contentType && contentType.includes('application/json')) {
        data = await ttsResponse.json();
      } else {
        const raw = await ttsResponse.text();
        console.error(`Cloud TTS returned non-JSON (${ttsResponse.status}):`, raw.slice(0, 200));
        throw new Error(`Cloud TTS non-JSON response: ${raw.slice(0, 100)}`);
      }

      if (!ttsResponse.ok) {
        const msg = data.error?.message || 'Cloud TTS error';
        console.error(`Cloud TTS Error (${ttsResponse.status}):`, msg);
        throw new Error(msg);
      }

      if (!data.audioContent) {
        throw new Error('No audioContent in Cloud TTS response');
      }

      res.json({ audioContent: data.audioContent });
    } catch (error: any) {
      console.error('Google Cloud TTS Error:', error);
      res.status(500).json({ error: error.message || 'Failed to synthesize speech' });
    }
  });

  // ── Gemini API proxy — Vertex AI (Service Account) preferred, falls back
  // to GEMINI_API_KEY. Same logic the Vercel function uses in production
  // (api/gemini.ts), so dev/prod behave identically.
  app.post('/api/gemini', async (req, res) => {
    const { model, contents, config: genConfig } = req.body;
    if (!model || !contents) {
      return res.status(400).json({ error: 'Missing model or contents in request body.' });
    }
    try {
      const { callGemini } = await import('./services/vertexProxy.js');
      const response = await callGemini(model, contents, genConfig);
      res.json(response);
    } catch (error: any) {
      console.error('Gemini proxy error:', error);
      const msg = error?.message || 'Gemini API call failed';
      const isQuota = /RESOURCE_EXHAUSTED|429|quota/i.test(msg);
      res.status(isQuota ? 429 : 500).json({ error: msg });
    }
  });

  // ── Gemini key/backend check endpoint ────────────────────────────────────
  app.get('/api/gemini/key-check', (_req, res) => {
    const hasVertex = !!(process.env.GCP_SA_KEY && process.env.GCP_PROJECT_ID);
    const hasApiKey = !!process.env.GEMINI_API_KEY;
    res.json({
      hasKey: hasVertex || hasApiKey,
      backend: hasVertex ? 'vertex' : hasApiKey ? 'apikey' : 'none',
    });
  });

  // Flask proxy routes — forward YouTube/video/files API calls to Flask on port 8000
  const FLASK_URL = 'http://localhost:8000';
  const flaskRoutes = ['/api/youtube', '/api/video', '/api/files', '/api/health', '/api/instagram', '/api/cookies', '/api/reddit', '/api/shorts'];

  app.use(flaskRoutes, async (req: any, res: any) => {
    const controller = new AbortController();
    // 10-minute timeout for long operations (video download, trim, etc.)
    const timeoutId = setTimeout(() => controller.abort(), 600_000);

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
    // Only block caching for the HTML entry point; let Vite serve JS/CSS with its own ETags
    app.use((req, res, next) => {
      if (req.path === '/' || req.path === '/index.html') {
        res.setHeader('Cache-Control', 'no-store');
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
