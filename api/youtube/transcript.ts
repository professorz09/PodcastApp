// Vercel proxy for /api/youtube/transcript
// Forwards to Render Flask server. Catches Render-is-sleeping errors and
// returns a friendly message instead of Vercel's cryptic ROUTER_EXTERNAL_TARGET_ERROR.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const FLASK_URL = 'https://autovid-flask.onrender.com';

export const config = { maxDuration: 120 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
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
