import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getGCPAccessToken } from '../../services/vertexProxy.js';

export const config = {
  api: { bodyParser: { sizeLimit: '50mb' } },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { audioContent, languageCode = 'en-US', mimeType, sampleRate } = req.body;
  if (!audioContent) {
    return res.status(400).json({ error: 'Missing audioContent' });
  }

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

    if (projectId) {
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
        const config = buildConfig(ver.enhanced);
        const url = urlSuffix(`${ver.base}/speech:recognize`);
        const data = await callGoogleSTT(url, { config, audio: { content: audioContent } }, authHeader);

        if (data.error?.message?.includes('too long') || data.error?.message?.includes('duration limit')) {
          const lrUrl = urlSuffix(`${ver.base}/speech:longrunningrecognize`);
          const lrData = await callGoogleSTT(lrUrl, { config, audio: { content: audioContent } }, authHeader);
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
}
