// PFAi local server — serves the static app AND proxies AI requests to
// OpenRouter so the API key stays server-side (never shipped to the browser).
// Zero dependencies; needs Node 18+ (global fetch). Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

// ── Minimal .env loader (no dependency) ─────────────────────────────────────
try {
  const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env — fine for static-only mode */ }

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;
const KEY = process.env.OPENROUTER_API_KEY || '';
const MODEL = process.env.COACH_MODEL || 'anthropic/claude-sonnet-4.6';
const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon',
};

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

function safeJSON(s) {
  try { return JSON.parse(s); } catch {}
  const m = String(s).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return {};
}

const COACH_SYSTEM = (ctx) => `You are PFAi Coach, a knowledgeable, encouraging U.S. Air Force fitness-assessment training coach.
Ground every answer in the member's CURRENT NUMBERS below — they were computed by the app's deterministic scorer, which is the source of truth. Do NOT invent or override official point values, minimums or pass marks; if asked for an exact chart value you don't see, say to check the Standards tab or DAFMAN 36-2905.
Give specific, practical, periodised training guidance (intervals, tempo, strength/core progressions, pacing, recovery). Prioritise the member's cheapest points and any failed component minimum first. Be concise (a few short paragraphs or tight bullets). You are not a medical professional — for pain/injury or medical clearance, defer to a provider and the unit fitness program manager. This is unofficial training prep, not an assessment of record.

CURRENT NUMBERS:
${ctx || '(none entered yet — ask the member for their run, push-up and core numbers, or point them to the Assess tab.)'}`;

const PARSE_SYSTEM = `Extract USAF fitness assessment inputs from the user's free text into STRICT JSON. Only include keys you are confident about. Schema:
{"sex":"male|female","age":int,"height":int(inches),"weight":int(lb),"waist":number(inches),
 "components":{"aerobic":{"exercise":"run_1_5mi|run_2mi|hamr","raw":number_or_"mm:ss"},
 "strength":{"exercise":"pushups|hrp","raw":int},
 "core":{"exercise":"situps|crunches|plank","raw":number_or_"mm:ss"}}}
Times as "mm:ss" strings; reps/shuttles as integers. Map phrases like "ran 1.5 in 12:40" -> aerobic run_1_5mi "12:40"; "38 pushups" -> strength pushups 38; "2:10 plank" -> core plank "2:10". Return ONLY the JSON object, no prose.`;

async function callOR(messages, { jsonMode = false, max_tokens = 700, temperature = 0.4 } = {}) {
  if (!KEY) { const e = new Error('no-key'); e.code = 'no-key'; throw e; }
  const r = await fetch(OR_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost',
      'X-Title': 'PFAi Coach',
    },
    body: JSON.stringify({ model: MODEL, messages, max_tokens, temperature, ...(jsonMode ? { response_format: { type: 'json_object' } } : {}) }),
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`OpenRouter ${r.status}: ${t.slice(0, 300)}`); }
  const data = await r.json();
  return data.choices?.[0]?.message?.content ?? '';
}

function serveStatic(urlPath, res) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/') p = '/index.html';
  const filePath = path.normalize(path.join(ROOT, p));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  if (req.method === 'GET' && url === '/api/health') return json(res, 200, { ok: true, model: MODEL, keyConfigured: !!KEY });

  if (req.method === 'POST' && (url === '/api/coach' || url === '/api/parse')) {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on('end', async () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch { return json(res, 400, { error: 'bad json' }); }
      try {
        if (url === '/api/coach') {
          const msgs = [{ role: 'system', content: COACH_SYSTEM(body.context) }, ...(Array.isArray(body.messages) ? body.messages.slice(-12) : [])];
          return json(res, 200, { reply: await callOR(msgs, { max_tokens: 700, temperature: 0.5 }) });
        }
        const out = await callOR([{ role: 'system', content: PARSE_SYSTEM }, { role: 'user', content: String(body.text || '') }], { jsonMode: true, max_tokens: 400, temperature: 0 });
        return json(res, 200, { data: safeJSON(out) });
      } catch (e) {
        if (e.code === 'no-key') return json(res, 503, { error: 'OPENROUTER_API_KEY not set on the server.' });
        return json(res, 502, { error: 'Upstream model error. Check COACH_MODEL / key / credits.' });
      }
    });
    return;
  }
  serveStatic(url, res);
});

server.listen(PORT, () => {
  console.log(`PFAi on http://localhost:${PORT}  (AI coach: ${KEY ? 'enabled · ' + MODEL : 'disabled — set OPENROUTER_API_KEY in .env'})`);
});
