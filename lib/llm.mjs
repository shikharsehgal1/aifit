// Shared OpenRouter helpers for the Vercel serverless functions (api/*).
// Local dev uses server.cjs, which mirrors these. Reads config from env so the
// key never reaches the browser.
const KEY = () => process.env.OPENROUTER_API_KEY || '';
const MODEL = () => process.env.COACH_MODEL || 'anthropic/claude-sonnet-4.6';
const OR_URL = () => process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1/chat/completions';

export const keyConfigured = () => !!KEY();
export const model = () => MODEL();

export const COACH_SYSTEM = (ctx) => `You are PFAi Coach, a knowledgeable, encouraging U.S. Air Force fitness-assessment training coach.
Ground every answer in the member's CURRENT NUMBERS below — they were computed by the app's deterministic scorer, which is the source of truth. Do NOT invent or override official point values, minimums or pass marks; if asked for an exact chart value you don't see, say to check the Standards tab or DAFMAN 36-2905.
Give specific, practical, periodised training guidance (intervals, tempo, strength/core progressions, pacing, recovery). Prioritise the member's cheapest points and any failed component minimum first. Be concise (a few short paragraphs or tight bullets). You are not a medical professional — for pain/injury or medical clearance, defer to a provider and the unit fitness program manager. This is unofficial training prep, not an assessment of record.

CURRENT NUMBERS:
${ctx || '(none entered yet — ask the member for their run, push-up and core numbers, or point them to the Assess tab.)'}`;

export const PARSE_SYSTEM = `Extract USAF fitness assessment inputs from the user's free text into STRICT JSON. Only include keys you are confident about. Schema:
{"sex":"male|female","age":int,"height":int(inches),"weight":int(lb),"waist":number(inches),
 "components":{"aerobic":{"exercise":"run_1_5mi|run_2mi|hamr","raw":number_or_"mm:ss"},
 "strength":{"exercise":"pushups|hrp","raw":int},
 "core":{"exercise":"situps|crunches|plank","raw":number_or_"mm:ss"}}}
Times as "mm:ss" strings; reps/shuttles as integers. Map phrases like "ran 1.5 in 12:40" -> aerobic run_1_5mi "12:40"; "38 pushups" -> strength pushups 38; "2:10 plank" -> core plank "2:10". Return ONLY the JSON object, no prose.`;

export function safeJSON(s) {
  try { return JSON.parse(s); } catch {}
  const m = String(s).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return {};
}

export async function orFetch(messages, { jsonMode = false, stream = false, max_tokens = 700, temperature = 0.4 } = {}) {
  return fetch(OR_URL(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://pfai.local',
      'X-Title': 'PFAi Coach',
    },
    body: JSON.stringify({ model: MODEL(), messages, max_tokens, temperature, stream, ...(jsonMode ? { response_format: { type: 'json_object' } } : {}) }),
  });
}

// Transform OpenRouter's SSE into our simple {delta}/{done}/{error} event stream.
export function transformSSE(upstreamBody) {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = '';
  return new ReadableStream({
    async start(controller) {
      const reader = upstreamBody.getReader();
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
}
