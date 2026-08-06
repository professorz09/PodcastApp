// Supabase Edge Function: /functions/v1/elevenlabs-voices
// Replaces the Vercel serverless function api/elevenlabs/voices.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, 'Content-Type': 'application/json' };

  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ELEVENLABS_API_KEY is missing' }), { status: 500, headers: jsonHeaders });
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': apiKey } });
    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs API Error:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch voices from ElevenLabs' }), { status: response.status, headers: jsonHeaders });
    }
    const data = await response.json();
    return new Response(JSON.stringify(data), { headers: jsonHeaders });
  } catch (error) {
    console.error('ElevenLabs Voices Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch voices' }), { status: 500, headers: jsonHeaders });
  }
});
