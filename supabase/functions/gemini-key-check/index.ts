// Supabase Edge Function: /functions/v1/gemini-key-check
// Replaces the Vercel serverless function api/gemini/key-check.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const hasVertex = !!(Deno.env.get('GCP_SA_KEY') && Deno.env.get('GCP_PROJECT_ID'));
  const hasApiKey = !!Deno.env.get('GEMINI_API_KEY');
  return new Response(JSON.stringify({
    hasKey: hasVertex || hasApiKey,
    backend: hasVertex ? 'vertex' : hasApiKey ? 'apikey' : 'none',
  }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
});
