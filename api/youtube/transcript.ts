// Vercel proxy for /api/youtube/transcript
// Tries Supadata (https://docs.supadata.ai) first when SUPADATA_API_KEY is
// set. On any failure it falls straight through to the Render Flask server,
// same as before. Catches Render-is-sleeping errors and returns a friendly
// message instead of Vercel's cryptic ROUTER_EXTERNAL_TARGET_ERROR.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const FLASK_URL = 'https://autovid-flask.onrender.com';

export const config = { maxDuration: 120 };

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

// Strip YouTube auto-caption noise from a single caption segment — mirrors
// clean_caption_text() in flask_server.py so both paths read the same.
function cleanCaptionText(text: string): string {
  return text
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '')
    .replace(/^[>\s]+/, '')
    .replace(/\[\s*_+\s*\]/g, '')
    .replace(/\[\s*[A-Za-z ]+\s*\]/g, '')
    .replace(/^\s*[>\-–—|]+\s*/, '')
    .split(/\s+/).filter(Boolean).join(' ');
}

type Segment = { text: string; start: number; end: number; duration: number };

async function fetchSupadata(url: string, videoId: string | null): Promise<{
  video_id: string | null; language: string; segments: Segment[]; full_text: string;
  title: string; description: string; uploader: string;
} | null> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) return null;

  const langAttempts: (string | undefined)[] = ['hi', 'ur', 'en', undefined];
  for (const lang of langAttempts) {
    const params = new URLSearchParams({ url });
    if (lang) params.set('lang', lang);
    let data: any;
    try {
      const resp = await fetch(`https://api.supadata.ai/v1/transcript?${params.toString()}`, {
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(20_000),
      });
      if (!resp.ok) continue;
      data = await resp.json();
    } catch {
      continue;
    }

    const content = data?.content;
    if (!content) continue;

    let segments: Segment[] = [];
    if (typeof content === 'string') {
      const text = cleanCaptionText(content);
      if (text) segments = [{ text, start: 0, end: 0, duration: 0 }];
    } else if (Array.isArray(content)) {
      segments = content
        .map((chunk: any) => {
          const text = cleanCaptionText(String(chunk.text ?? ''));
          const start = (chunk.offset ?? 0) / 1000;
          const duration = (chunk.duration ?? 0) / 1000;
          return text ? { text, start, end: start + duration, duration } : null;
        })
        .filter((s: Segment | null): s is Segment => s !== null);
    }

    if (segments.length > 0) {
      return {
        video_id: videoId,
        language: data.lang || lang || 'auto',
        segments,
        full_text: segments.map(s => s.text).join(' '),
        title: '',
        description: '',
        uploader: '',
      };
    }
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const reqBody = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const url = String(reqBody.url || '').trim();

  if (url) {
    try {
      const supadataResult = await fetchSupadata(url, extractVideoId(url));
      if (supadataResult) {
        return res.status(200).json(supadataResult);
      }
    } catch (err: any) {
      console.warn('[transcript-proxy] Supadata failed, falling back to Flask:', err?.message || err);
    }
  }

  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});

  let flaskRes: Response;
  try {
    flaskRes = await fetch(`${FLASK_URL}/api/youtube/transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // signal: AbortSignal.timeout(110_000),  // just under maxDuration
    });
  } catch (err: any) {
    // Render free tier sleeps after 15 min — connection refused / ECONNREFUSED
    // shows as Vercel's ROUTER_EXTERNAL_TARGET_ERROR to the user.
    // Return a clear message instead.
    const msg = String(err?.message || err);
    const isDown = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(msg);
    console.error('[transcript-proxy] Render unreachable:', msg);
    return res.status(200).json({
      error: isDown
        ? 'Transcript server is starting up (Render free tier sleeps after inactivity). Please wait 30 seconds and try again.'
        : `Could not reach transcript server: ${msg}`,
      error_code: isDown ? 'SERVER_WAKING_UP' : 'PROXY_ERROR',
    });
  }

  // Forward status + body from Flask as-is
  const ct = flaskRes.headers.get('content-type') || 'application/json';
  res.setHeader('Content-Type', ct);
  const buf = await flaskRes.arrayBuffer();
  return res.status(flaskRes.status).send(Buffer.from(buf));
}
