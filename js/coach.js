// PFAi — AI coach client. Talks to the local proxy (/api/*), which holds the
// OpenRouter key server-side. Everything degrades gracefully when the proxy
// isn't running (e.g. static hosting): the app stays fully usable on-device.

let _status = null; // { available, model } once probed

export async function coachStatus() {
  if (_status) return _status;
  try {
    const r = await fetch('/api/health', { method: 'GET' });
    const j = await r.json();
    _status = { available: !!j.keyConfigured, model: j.model };
  } catch {
    _status = { available: false, model: null };
  }
  return _status;
}

export async function coachChat(messages, context) {
  const r = await fetch('/api/coach', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, context }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j.reply;
}

// LLM natural-language intake. Returns a parsed object or throws (callers fall
// back to the rule-based parser).
export async function coachParse(text) {
  const r = await fetch('/api/parse', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j.data || {};
}
