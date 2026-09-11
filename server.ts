import express from 'express';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { callGemini, getGCPAccessToken, isValidPrivateKey } from './services/vertexProxy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(process.cwd(), 'temp_uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir, limits: { fileSize: 1024 * 1024 * 1024 } });

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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
    const { audioContent, languageCode = 'en-US', mimeType, sampleRate } = req.body;
    if (!audioContent) {
      return res.status(400).json({ error: 'Missing audioContent' });
    }

    // ── Helper: POST to Google STT with given auth header ─────────────────
    const callGoogleSTT = async (url: string, body: object, authHeader: Record<string, string>) => {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify(body),
      });
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        const txt = await resp.text();
        throw new Error(`Google STT returned non-JSON (HTTP ${resp.status}): ${txt.slice(0, 200)}`);
      }
      const data = await resp.json() as any;
      if (!resp.ok) {
        const msg = data.error?.message || data.error?.status || JSON.stringify(data.error) || 'Unknown Google STT error';
        throw new Error(`Google STT error (HTTP ${resp.status}): ${msg}`);
      }
      return data;
    };

    const buildConfig = (enhanced: boolean) => {
      const cfg: any = { languageCode, enableWordTimeOffsets: true };
      if (enhanced) { cfg.model = 'latest_long'; cfg.useEnhanced = true; }
      if (mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') {
        cfg.encoding = 'MP3'; cfg.sampleRateHertz = sampleRate || 44100;
      } else if (mimeType === 'audio/wav') {
        cfg.encoding = 'LINEAR16';
      } else if (sampleRate) {
        cfg.sampleRateHertz = sampleRate;
      }
      return cfg;
    };

    const runSTT = async (authHeader: Record<string, string>, urlSuffix: (base: string) => string) => {
      const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

      // Try STT v2 first if project ID is available
      if (projectId) {
        console.log(`Using Google STT v2 (project: ${projectId})`);
        const v2Url = urlSuffix(`https://speech.googleapis.com/v2/projects/${projectId}/locations/global/recognizers/_:recognize`);
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
          const v2Data = await callGoogleSTT(v2Url, v2Body, authHeader);
          if (v2Data.results) {
            v2Data.results.forEach((r: any) => {
              r.alternatives?.[0]?.words?.forEach((w: any) => {
                if (w.startOffset !== undefined) w.startTime = w.startOffset;
                if (w.endOffset !== undefined)   w.endTime   = w.endOffset;
              });
            });
          }
          return v2Data;
        } catch (v2Err: any) {
          console.warn('STT v2 failed, falling back to v1p1beta1:', v2Err.message);
        }
      }

      const versions = [
        { label: 'v1p1beta1', base: 'https://speech.googleapis.com/v1p1beta1', enhanced: true  },
        { label: 'v1',        base: 'https://speech.googleapis.com/v1',        enhanced: false },
      ];

      let lastErr: Error | null = null;
      for (const ver of versions) {
        try {
          console.log(`Trying Google STT ${ver.label}`);
          const config = buildConfig(ver.enhanced);
          const url = urlSuffix(`${ver.base}/speech:recognize`);
          const data = await callGoogleSTT(url, { config, audio: { content: audioContent } }, authHeader);

          if (data.error?.message?.includes('too long') || data.error?.message?.includes('duration limit')) {
            const lrUrl = urlSuffix(`${ver.base}/speech:longrunningrecognize`);
            const lrData = await callGoogleSTT(lrUrl, { config, audio: { content: audioContent } }, authHeader);
            console.log('Long-running operation started:', lrData.name);
            return { operationName: lrData.name };
          }

          return data;
        } catch (verErr: any) {
          console.warn(`STT ${ver.label} failed:`, verErr.message);
          lastErr = verErr;
          if (verErr.message?.includes('disabled') || verErr.message?.includes('blocked')) break;
        }
      }

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
    };

    // Try Vertex SA auth first
    try {
      const token = await getGCPAccessToken();
      const projectId = process.env.GCP_PROJECT_ID;
      const saHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (projectId) saHeaders['x-goog-user-project'] = projectId;
      console.log('STT: using Vertex SA auth');
      const data = await runSTT(saHeaders, (base) => base);
      return res.json(data);
    } catch (saErr: any) {
      console.warn('STT SA auth failed, falling back to API key:', saErr.message);
    }

    // Fallback: plain API key
    const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'No STT auth available: set GCP_SA_KEY or GOOGLE_CLOUD_API_KEY' });
    }
    try {
      const data = await runSTT({}, (base) => `${base}?key=${apiKey}`);
      res.json(data);
    } catch (error: any) {
      console.error('Google Speech API Error:', error.message);
      res.status(500).json({ error: error.message || 'Failed to transcribe audio' });
    }
  });

  app.get('/api/google/operations', async (req, res) => {
    const { name } = req.query;
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

    // Try Vertex SA auth first
    try {
      const token = await getGCPAccessToken();
      const projectId = process.env.GCP_PROJECT_ID;
      const saHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (projectId) saHeaders['x-goog-user-project'] = projectId;
      const data = await fetchOp(baseUrl, saHeaders);
      return res.json(data);
    } catch (saErr: any) {
      console.warn('Operations SA auth failed, falling back to API key:', saErr.message);
    }

    // Fallback: plain API key
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
  });

  // ── Google Cloud Text-to-Speech (Chirp 3 HD) — Vertex SA auth preferred ───
  app.post('/api/google/text-to-speech', async (req, res) => {
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

    try {
      const token = await getGCPAccessToken();
      const projectId = process.env.GCP_PROJECT_ID;
      const saHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };
      if (projectId) saHeaders['x-goog-user-project'] = projectId;
      console.log('Cloud TTS: using Vertex SA auth');
      const ttsResponse = await fetch(
        'https://texttospeech.googleapis.com/v1/text:synthesize',
        { method: 'POST', headers: saHeaders, body: ttsBody }
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
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ttsBody }
      );
      const data = await parseTTSResponse(ttsResponse);
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
  });

  // Flask proxy routes — forward YouTube/video/files API calls to Flask
  const FLASK_URL = process.env.FLASK_URL || (process.env.LOCAL_FLASK === 'true' ? 'http://localhost:8000' : 'https://autovid-flask.onrender.com');

  // Health endpoint: return health status and check if cookies exist
  app.get('/api/health', async (_req, res) => {
    try {
      const resp = await fetch(`${FLASK_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        const data = await resp.json();
        return res.json(data);
      }
    } catch {
      // Fall through to node status
    }
    const fs = await import('fs');
    const cookiesExist = fs.existsSync(path.join(process.cwd(), 'yt_cookies.txt'));
    res.json({ status: 'ok', cookies: cookiesExist, fallback: true });
  });

  // Channel Intro Video Check
  app.get('/api/video/has-intro', (_req, res) => {
    const introPath = path.join(process.cwd(), 'public', 'intro.mp4');
    const exists = fs.existsSync(introPath);
    res.json({
      hasIntro: exists,
      filename: 'intro.mp4',
      size: exists ? fs.statSync(introPath).size : 0
    });
  });

  // Local FFmpeg Merge Intro Endpoint (prepends public/intro.mp4)
  const handleMergeIntro = async (req: any, res: any) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Missing rendered_video file' });
    }

    const renderedPath = req.file.path;
    const introPath = path.join(process.cwd(), 'public', 'intro.mp4');

    if (!fs.existsSync(introPath)) {
      console.warn('Intro file public/intro.mp4 not found, returning rendered video');
      return res.download(renderedPath, 'rendered_video.mp4', () => {
        try { fs.unlinkSync(renderedPath); } catch {}
      });
    }

    const resolution = req.body?.resolution === '1080p' ? '1080p' : '720p';
    const targetW = resolution === '1080p' ? 1920 : 1280;
    const targetH = resolution === '1080p' ? 1080 : 720;
    const outputPath = path.join(uploadDir, `merged_${Date.now()}.mp4`);

    console.log(`[FFmpeg] Merging intro (${introPath}) + rendered (${renderedPath}) at ${resolution}...`);

    const filterComplex = `[0:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v0];[1:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v1];[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a0];[1:a]aformat=sample_rates=44100:channel_layouts=stereo[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]`;

    const ffmpegArgs = [
      '-y',
      '-i', introPath,
      '-i', renderedPath,
      '-filter_complex', filterComplex,
      '-map', '[v]',
      '-map', '[a]',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      outputPath
    ];

    const child = spawn('ffmpeg', ffmpegArgs);
    let stderr = '';

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      try { fs.unlinkSync(renderedPath); } catch {}

      if (code !== 0) {
        console.error('[FFmpeg] Merge failed with code:', code, stderr.slice(-400));
        try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
        return res.status(500).json({ error: 'FFmpeg merge failed', details: stderr.slice(-300) });
      }

      console.log(`[FFmpeg] Merge successful: ${outputPath}`);
      res.download(outputPath, `english_podcast_${Date.now()}.mp4`, (err: any) => {
        try {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch {}
      });
    });

    child.on('error', (err) => {
      console.error('[FFmpeg] Spawn error:', err);
      try { fs.unlinkSync(renderedPath); } catch {}
      try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
      res.status(500).json({ error: err.message });
    });
  };

  app.post('/api/video/merge-intro', upload.single('rendered_video'), handleMergeIntro);
  app.post('/api/video/merge', upload.single('rendered_video'), handleMergeIntro);

  const flaskRoutes = ['/api/youtube', '/api/video', '/api/files', '/api/instagram', '/api/cookies', '/api/reddit', '/api/shorts'];

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

      // If YouTube transcript failed, try native Node fallback with youtube-transcript
      if (req.originalUrl?.includes('/api/youtube/transcript')) {
        try {
          const url = req.body?.url;
          if (url) {
            const { YoutubeTranscript } = await import('youtube-transcript');
            const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
            const videoId = match ? match[1] : (url.length === 11 ? url : '');
            if (videoId) {
              const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
              const segments = transcriptItems.map(item => ({
                text: item.text,
                start: item.offset / 1000,
                duration: item.duration / 1000,
              }));
              const fullText = segments.map(s => s.text).join(' ');
              return res.json({
                segments,
                full_text: fullText,
                video_id: videoId,
                language: 'auto',
                title: '',
                description: '',
              });
            }
          }
        } catch (fallbackError: any) {
          console.warn('Node YouTube transcript fallback also failed:', fallbackError?.message);
        }
      }

      if (err.name === 'AbortError') {
        res.status(504).json({ error: 'Server ne response dene mein bahut waqt liya (timeout).' });
      } else if (err.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNREFUSED') {
        res.status(503).json({ error: 'Backend server chal nahi raha hai.' });
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
