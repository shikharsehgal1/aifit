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

// Streaming coach reply. Calls onDelta(fullTextSoFar) as tokens arrive and
// resolves with the complete text. Falls back to a JSON reply if the server
// didn't stream (e.g. an error response).
export async function coachChatStream(messages, context, onDelta, signal) {
  const r = await fetch('/api/coach', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, context, stream: true }), signal,
  });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('text/event-stream')) {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    const reply = j.reply || '';
    onDelta && onDelta(reply);
    return reply;
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const evt = buf.slice(0, idx); buf = buf.slice(idx + 2);
      const line = evt.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      let o; try { o = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (o.error) throw new Error(o.error);
      if (o.delta) { full += o.delta; onDelta && onDelta(full); }
    }
  }
  return full;
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
