// POST /api/coach — streams a grounded coaching reply (SSE) or returns JSON
// when { stream:false }. Key stays server-side (Vercel env var).
import { COACH_SYSTEM, orFetch, transformSSE, keyConfigured } from '../lib/llm.mjs';

export const config = { runtime: 'edge' };

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!keyConfigured()) return json({ error: 'OPENROUTER_API_KEY not set on the server.' }, 503);

  let body = {};
  try { body = await req.json(); } catch {}
  const messages = [
    { role: 'system', content: COACH_SYSTEM(body.context) },
    ...(Array.isArray(body.messages) ? body.messages.slice(-12) : []),
  ];

  let upstream;
  try { upstream = await orFetch(messages, { stream: body.stream !== false, max_tokens: 700, temperature: 0.5 }); }
  catch { return json({ error: 'Could not reach the model.' }, 502); }
  if (!upstream.ok) { const t = await upstream.text().catch(() => ''); return json({ error: `OpenRouter ${upstream.status}: ${t.slice(0, 200)}` }, 502); }

  if (body.stream === false) {
    const d = await upstream.json();
    return json({ reply: d.choices?.[0]?.message?.content ?? '' });
  }
  return new Response(transformSSE(upstream.body), {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
