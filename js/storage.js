// PFAi — local persistence (no backend in the MVP; all data stays on-device).
// Structured so a future API/DB swap only touches this module.

const KEY = 'pfai.state.v1';
const SCHEMA = 2;

const DEFAULT = {
  schemaVersion: SCHEMA,
  profile: { sex: 'male', age: 25, height: 70, weight: 180, waist: 36, branch: 'usaf' },
  goal: { date: null, target: 'pass' }, // target: 'pass' | 'satisfactory' | 'excellent'
  settings: { daysPerWeek: 4, equipment: 'gym', injuries: '', reminders: false, ruleset: 'pfa2026', altitudeFt: 0 },
  assessments: [], // { ts, input, result }
  logs: [], // workout log entries { ts, type, note, done }
  achievements: [], // earned badge keys
  coach: [], // saved AI-coach conversation { role, content }
  draftInput: null, // in-progress Assess entry (survives reloads)
  plan: null, // last generated training plan { reg, settings, ts }
  unit: { id: null, members: [] }, // leader view roster (on-device)
};

// Deep-merge a parsed blob onto DEFAULT so returning users gain any new nested
// fields (the old shallow merge silently dropped them — a real data bug).
function migrate(parsed) {
  const base = structuredClone(DEFAULT);
  for (const k of Object.keys(base)) {
    const v = parsed[k];
    if (v == null) continue;
    if (Array.isArray(base[k]) || typeof base[k] !== 'object' || base[k] === null) base[k] = v;
    else base[k] = { ...base[k], ...v }; // nested objects: profile/goal/settings/unit
  }
  base.schemaVersion = SCHEMA;
  return base;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    return migrate(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false; // e.g. QuotaExceededError — caller can warn the user
  }
}

// Full backup/restore (round-trips exportJSON). Returns the migrated state or
// throws on an unreadable file.
export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('profile' in parsed || 'assessments' in parsed)) {
    throw new Error('Not a PFAi backup file.');
  }
  const state = migrate(parsed);
  saveState(state);
  return state;
}

// Ask the browser to keep our data (iOS Safari evicts script localStorage after
// ~7 days idle unless installed/persisted). Best-effort, no-op if unsupported.
export function requestPersistence() {
  try { navigator.storage?.persist?.(); } catch {}
}

export function recordAssessment(state, input, result, ts) {
  state.assessments.push({ ts, input, result });
  state.assessments = state.assessments.slice(-200);
  return state;
}

// Trend series for one component (or composite) across stored assessments.
export function trendSeries(state, key) {
  return state.assessments
    .filter((a) => a.result)
    .map((a) => {
      const v =
        key === 'composite'
          ? a.result.composite
          : a.result.components?.[key]?.points ?? null;
      return { ts: a.ts, value: v };
    })
    .filter((p) => p.value != null);
}

// Achievement rules. Returns newly-earned badges given a fresh result.
const BADGES = [
  { key: 'first_assess', label: 'First Assessment', test: (s) => s.assessments.length >= 1 },
  { key: 'passed', label: 'Passed the PFA', test: (s, r) => r?.pass === true },
  { key: 'satisfactory', label: 'Reached Satisfactory', test: (s, r) => r?.composite >= 80 },
  { key: 'excellent', label: 'Reached Excellent', test: (s, r) => r?.composite >= 90 },
  { key: 'max', label: 'Maxed the PFA', test: (s, r) => r?.composite >= 100 },
  { key: 'logger_7', label: '7 Workouts Logged', test: (s) => s.logs.filter((l) => l.done).length >= 7 },
];

export function evaluateBadges(state, result) {
  const newly = [];
  for (const b of BADGES) {
    if (!state.achievements.includes(b.key) && b.test(state, result)) {
      state.achievements.push(b.key);
      newly.push(b);
    }
  }
  return newly;
}

export function badgeLabel(key) {
  return BADGES.find((b) => b.key === key)?.label || key;
}

export function exportJSON(state) {
  return JSON.stringify(state, null, 2);
}
