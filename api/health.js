// GET /api/health — reports whether the server has a key configured.
export const config = { runtime: 'edge' };

export default async function handler() {
  return new Response(
    JSON.stringify({
      ok: true,
      model: process.env.COACH_MODEL || 'anthropic/claude-sonnet-4.6',
      keyConfigured: !!(process.env.OPENROUTER_API_KEY || ''),
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
