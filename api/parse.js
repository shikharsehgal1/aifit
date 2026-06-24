// POST /api/parse — LLM natural-language intake → structured JSON.
import { PARSE_SYSTEM, orFetch, safeJSON, keyConfigured } from '../lib/llm.mjs';

export const config = { runtime: 'edge' };

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!keyConfigured()) return json({ error: 'OPENROUTER_API_KEY not set on the server.' }, 503);

  let body = {};
  try { body = await req.json(); } catch {}

  let upstream;
  try {
    upstream = await orFetch(
      [{ role: 'system', content: PARSE_SYSTEM }, { role: 'user', content: String(body.text || '') }],
      { jsonMode: true, max_tokens: 400, temperature: 0 },
    );
  } catch { return json({ error: 'Could not reach the model.' }, 502); }
  if (!upstream.ok) return json({ error: 'Upstream model error.' }, 502);

  const d = await upstream.json();
  return json({ data: safeJSON(d.choices?.[0]?.message?.content ?? '') });
}
