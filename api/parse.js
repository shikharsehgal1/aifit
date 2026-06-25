// POST /api/parse — LLM natural-language intake → structured JSON.
// Self-contained (no external imports) so Vercel bundles it cleanly.
export const config = { runtime: 'edge' };

const OR_URL = () => process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = () => process.env.COACH_MODEL || 'anthropic/claude-sonnet-4.6';
const KEY = () => process.env.OPENROUTER_API_KEY || '';

const PARSE_SYSTEM = `Extract USAF fitness assessment inputs from the user's free text into STRICT JSON. Only include keys you are confident about. Schema:
{"sex":"male|female","age":int,"height":int(inches),"weight":int(lb),"waist":number(inches),
 "components":{"aerobic":{"exercise":"run_1_5mi|run_2mi|hamr","raw":number_or_"mm:ss"},
 "strength":{"exercise":"pushups|hrp","raw":int},
 "core":{"exercise":"situps|crunches|plank","raw":number_or_"mm:ss"}}}
Times as "mm:ss" strings; reps/shuttles as integers. Map phrases like "ran 1.5 in 12:40" -> aerobic run_1_5mi "12:40"; "38 pushups" -> strength pushups 38; "2:10 plank" -> core plank "2:10". Return ONLY the JSON object, no prose.`;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

function safeJSON(s) {
  try { return JSON.parse(s); } catch {}
  const m = String(s).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return {};
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!KEY()) return json({ error: 'OPENROUTER_API_KEY not set on the server.' }, 503);

  let body = {};
  try { body = await req.json(); } catch {}

  let upstream;
  try {
    upstream = await fetch(OR_URL(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://pfai.local', 'X-Title': 'PFAi Coach' },
      body: JSON.stringify({
        model: MODEL(),
        messages: [{ role: 'system', content: PARSE_SYSTEM }, { role: 'user', content: String(body.text || '') }],
        max_tokens: 400, temperature: 0, response_format: { type: 'json_object' },
      }),
    });
  } catch { return json({ error: 'Could not reach the model.' }, 502); }
  if (!upstream.ok) return json({ error: 'Upstream model error.' }, 502);

  const d = await upstream.json();
  return json({ data: safeJSON(d.choices?.[0]?.message?.content ?? '') });
}
