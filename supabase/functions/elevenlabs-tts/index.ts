// Supabase Edge Function: /functions/v1/elevenlabs-tts
// Replaces the Vercel serverless function api/elevenlabs/tts.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, 'Content-Type': 'application/json' };

  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ELEVENLABS_API_KEY is missing' }), { status: 500, headers: jsonHeaders });
  }

  let payload: any;
  try { payload = await req.json(); } catch { payload = {}; }
  const { text, voiceId } = payload;
  if (!text || !voiceId) {
    return new Response(JSON.stringify({ error: 'Missing text or voiceId' }), { status: 400, headers: jsonHeaders });
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: { message: 'Unknown error' } }));
      throw new Error(error.detail?.message || 'Failed to generate speech');
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Response(arrayBuffer, { headers: { ...CORS_HEADERS, 'Content-Type': 'audio/mpeg' } });
  } catch (error: any) {
    console.error('ElevenLabs TTS Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Failed to generate speech' }), { status: 500, headers: jsonHeaders });
  }
});
