// POST /api/coach — streams a grounded coaching reply (SSE), or returns JSON
// when { stream:false }. Self-contained so Vercel bundles it with no external
// imports. Key stays server-side (Vercel env var).
export const config = { runtime: 'edge' };

const OR_URL = () => process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = () => process.env.COACH_MODEL || 'anthropic/claude-sonnet-4.6';
const KEY = () => process.env.OPENROUTER_API_KEY || '';

const COACH_SYSTEM = (ctx) => `You are PFAi Coach, a knowledgeable, encouraging U.S. Air Force fitness-assessment training coach.
Ground every answer in the member's CURRENT NUMBERS below — they were computed by the app's deterministic scorer, which is the source of truth. Do NOT invent or override official point values, minimums or pass marks; if asked for an exact chart value you don't see, say to check the Standards tab or DAFMAN 36-2905.
Give specific, practical, periodised training guidance (intervals, tempo, strength/core progressions, pacing, recovery). Prioritise the member's cheapest points and any failed component minimum first. Be concise (a few short paragraphs or tight bullets). You are not a medical professional — for pain/injury or medical clearance, defer to a provider and the unit fitness program manager. This is unofficial training prep, not an assessment of record.

CURRENT NUMBERS:
${ctx || '(none entered yet — ask the member for their run, push-up and core numbers, or point them to the Assess tab.)'}`;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!KEY()) return json({ error: 'OPENROUTER_API_KEY not set on the server.' }, 503);

  let body = {};
  try { body = await req.json(); } catch {}
  const messages = [
    { role: 'system', content: COACH_SYSTEM(body.context) },
    ...(Array.isArray(body.messages) ? body.messages.slice(-12) : []),
  ];
  const stream = body.stream !== false;

  let upstream;
  try {
    upstream = await fetch(OR_URL(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://pfai.local', 'X-Title': 'PFAi Coach' },
      body: JSON.stringify({ model: MODEL(), messages, max_tokens: 700, temperature: 0.5, stream }),
    });
  } catch { return json({ error: 'Could not reach the model.' }, 502); }
  if (!upstream.ok) { const t = await upstream.text().catch(() => ''); return json({ error: `OpenRouter ${upstream.status}: ${t.slice(0, 200)}` }, 502); }

  if (!stream) {
    const d = await upstream.json();
    return json({ reply: d.choices?.[0]?.message?.content ?? '' });
  }

  // Transform OpenRouter SSE → our simple {delta}/{done}/{error} events.
  const out = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const dec = new TextDecoder();
      const reader = upstream.body.getReader();
      let buf = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') { controller.enqueue(enc.encode('data: {"done":true}\n\n')); controller.close(); return; }
            try { const d = JSON.parse(data).choices?.[0]?.delta?.content; if (d) controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: d })}\n\n`)); } catch {}
          }
        }
        controller.enqueue(enc.encode('data: {"done":true}\n\n'));
        controller.close();
      } catch {
        controller.enqueue(enc.encode('data: {"error":"stream interrupted"}\n\n'));
        controller.close();
      }
    },
  });
  return new Response(out, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}
