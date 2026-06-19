// Vercel serverless function for YouTube transcript fetching.
//
// Why this lives here and not purely as a vercel.json rewrite:
//   The filesystem (this function) takes precedence over the
//   `/api/youtube/:path*` rewrite, so ONLY `/api/youtube/transcript`
//   is intercepted here — every other `/api/youtube/*` path still
//   rewrites straight through to the Render Flask server untouched.
//
// Flow:
//   1. Proxy the request to the Render Flask scraper (the existing path).
//   2. If the scraper returns real segments, pass that response through.
//   3. If the scraper fails / is rate-limited / returns no transcript,
//      fall back to Gemini 3.x: hand it the YouTube URL directly so it
//      watches the video and produces a timestamped transcript. Gemini
//      pulls the video from Google's own infra, so it sidesteps the
//      YouTube IP rate-limiting that blocks the scraper.
//
// Gemini auth reuses the SAME env vars already configured on Vercel for
// /api/gemini (GCP_SA_KEY + GCP_PROJECT_ID, or GEMINI_API_KEY) — nothing
// new needs to be set on Render.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callGemini } from '../../services/vertexProxy.js';

const FLASK_URL = 'https://autovid-flask.onrender.com';
const GEMINI_MODEL = process.env.GEMINI_TRANSCRIPT_MODEL || 'gemini-3.5-flash';

// Gemini watching a full video can take a while — request the max the plan
// allows (Vercel clamps to the plan ceiling: 60s Hobby, 300s Pro).
export const config = {
  maxDuration: 300,
};

function extractVideoId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /[?&]v=([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function cleanCaptionText(text: string): string {
  if (!text) return '';
  // Decode a few common HTML entities, strip tags / speaker arrows / noise.
  let t = text
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '')
    .replace(/^[>\s]+/, '')
    .replace(/\[\s*_+\s*\]/g, '')
    .replace(/\[\s*[A-Za-z ]+\s*\]/g, '');
  return t.split(/\s+/).join(' ').trim();
}

// Long podcasts can blow Gemini's output-token ceiling and truncate the
// JSON array mid-stream. Try a clean array parse first; if that fails,
// salvage every complete {...} object individually.
function parseSegments(text: string): any[] {
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through to salvage */
    }
  }
  const objs: any[] = [];
  const re = /\{[^{}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    try {
      objs.push(JSON.parse(m[0]));
    } catch {
      /* skip incomplete */
    }
  }
  return objs;
}

async function geminiFallback(url: string, videoId: string, base: any) {
  const prompt =
    'Watch this YouTube video carefully and provide a complete, word-for-word transcript.\n\n' +
    'Return ONLY a valid JSON array — no markdown, no explanation, nothing else:\n' +
    '[{"text": "exact spoken words", "start": 0.0, "duration": 5.0}, ...]\n\n' +
    'Rules:\n' +
    '- "text": verbatim speech (Hindi, English, or mixed — preserve as-is)\n' +
    '- "start": seconds from the video beginning\n' +
    '- "duration": how long this segment plays (seconds)\n' +
    '- Each segment = one natural sentence or ~5-15 seconds of speech\n' +
    '- If exact timestamps are uncertain, space them evenly based on pacing';

  const contents = [
    { fileData: { fileUri: url } },
    { text: prompt },
  ];
  const genConfig = {
    // Grounding with Google Search — cross-checks names/facts against the web.
    tools: [{ googleSearch: {} }],
    temperature: 0.2,
  };

  const response: any = await callGemini(GEMINI_MODEL, contents, genConfig);

  // @google/genai exposes `.text`; fall back to walking candidates.
  let raw = '';
  try {
    raw = typeof response.text === 'function' ? response.text() : (response.text || '');
  } catch {
    raw = '';
  }
  if (!raw && response.candidates?.[0]?.content?.parts) {
    raw = response.candidates[0].content.parts.map((p: any) => p.text || '').join('');
  }

  const segs = parseSegments(raw || '');
  const segments = [];
  for (const s of segs) {
    if (!s || typeof s !== 'object') continue;
    const text = cleanCaptionText(String(s.text ?? ''));
    if (!text) continue;
    const start = Number.isFinite(+s.start) ? +s.start : 0;
    const duration = Number.isFinite(+s.duration) ? +s.duration : 5;
    segments.push({
      text,
      start: Math.round(start * 100) / 100,
      end: Math.round((start + duration) * 100) / 100,
      duration: Math.round(duration * 100) / 100,
    });
  }

  if (!segments.length) return null;

  const fullText = segments.map((s) => s.text).join(' ');
  return {
    video_id: videoId,
    language: 'gemini',
    transcript_source: 'gemini',
    segments,
    full_text: fullText,
    // Carry over any metadata the scraper managed to fetch before failing.
    title: base?.title || '',
    description: base?.description || '',
    uploader: base?.uploader || '',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const url = (body.url || '').trim();
  if (!url) {
    return res.status(400).json({ error: 'URL is required.', error_code: 'MISSING_URL' });
  }
  const videoId = extractVideoId(url);
  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL.', error_code: 'INVALID_URL' });
  }

  // ── Stage A: the existing Render Flask scraper.
  let scraperData: any = null;
  let scraperOk = false;
  try {
    const flaskRes = await fetch(`${FLASK_URL}/api/youtube/transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    scraperData = await flaskRes.json().catch(() => null);
    // Real success = HTTP ok AND actual segments. Flask returns 200 with an
    // error_code (e.g. RATE_LIMITED) when it has no transcript, so check both.
    if (flaskRes.ok && scraperData?.segments?.length > 0) {
      scraperOk = true;
    }
  } catch {
    /* network error → fall through to Gemini */
  }

  if (scraperOk) {
    return res.status(200).json(scraperData);
  }

  // ── Stage B: Gemini fallback (watches the video directly).
  try {
    const gem = await geminiFallback(url, videoId, scraperData);
    if (gem) {
      return res.status(200).json(gem);
    }
  } catch (err: any) {
    console.error('Gemini transcript fallback error:', err?.message || err);
    // If the scraper had a concrete error to report, prefer surfacing that.
    if (scraperData?.error) {
      return res.status(200).json(scraperData);
    }
    return res.status(200).json({
      error: 'Transcript could not be fetched by scraping or Gemini. ' + (err?.message || ''),
      error_code: 'NO_TRANSCRIPT',
    });
  }

  // Both stages produced nothing usable.
  if (scraperData) {
    return res.status(200).json(scraperData);
  }
  return res.status(200).json({
    error: 'No transcript found for this video.',
    error_code: 'NO_TRANSCRIPT',
  });
}
