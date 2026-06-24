// GET /api/health — reports whether the server has a key configured.
import { keyConfigured, model } from '../lib/llm.mjs';

export const config = { runtime: 'edge' };

export default async function handler() {
  return new Response(JSON.stringify({ ok: true, model: model(), keyConfigured: keyConfigured() }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
