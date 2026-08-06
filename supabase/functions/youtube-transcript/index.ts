// Supabase Edge Function: /functions/v1/youtube-transcript
// Replaces the Vercel serverless function api/youtube/transcript.ts.
// Tries Supadata (https://docs.supadata.ai) first when SUPADATA_API_KEY is
// set. On any failure it falls straight through to the Render Flask server,
// same as the Vercel version did.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FLASK_URL = 'https://autovid-flask.onrender.com';

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

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
  const apiKey = Deno.env.get('SUPADATA_API_KEY');
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
        full_text: segments.map((s) => s.text).join(' '),
        title: '',
        description: '',
        uploader: '',
      };
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, 'Content-Type': 'application/json' };

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
  }

  let reqBody: any;
  try { reqBody = await req.json(); } catch { reqBody = {}; }
  const url = String(reqBody.url || '').trim();

  if (url) {
    try {
      const supadataResult = await fetchSupadata(url, extractVideoId(url));
      if (supadataResult) {
        return new Response(JSON.stringify(supadataResult), { headers: jsonHeaders });
      }
    } catch (err: any) {
      console.warn('[transcript-proxy] Supadata failed, falling back to Flask:', err?.message || err);
    }
  }

  let flaskRes: Response;
  try {
    flaskRes = await fetch(`${FLASK_URL}/api/youtube/transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });
  } catch (err: any) {
    const msg = String(err?.message || err);
    const isDown = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(msg);
    console.error('[transcript-proxy] Render unreachable:', msg);
    return new Response(JSON.stringify({
      error: isDown
        ? 'Transcript server is starting up (Render free tier sleeps after inactivity). Please wait 30 seconds and try again.'
        : `Could not reach transcript server: ${msg}`,
      error_code: isDown ? 'SERVER_WAKING_UP' : 'PROXY_ERROR',
    }), { headers: jsonHeaders });
  }

  const ct = flaskRes.headers.get('content-type') || 'application/json';
  const buf = await flaskRes.arrayBuffer();
  return new Response(buf, { status: flaskRes.status, headers: { ...CORS_HEADERS, 'Content-Type': ct } });
});
