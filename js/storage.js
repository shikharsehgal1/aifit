// PFAi — local persistence (no backend in the MVP; all data stays on-device).
// Structured so a future API/DB swap only touches this module.

const KEY = 'pfai.state.v1';

const DEFAULT = {
  profile: { sex: 'male', age: 25, height: 70, weight: 180, waist: 36, branch: 'usaf' },
  goal: { date: null, target: 'pass' }, // target: 'pass' | 'satisfactory' | 'excellent'
  settings: { daysPerWeek: 4, equipment: 'gym', injuries: '', reminders: false, ruleset: 'legacy' },
  assessments: [], // { ts, input, result }
  logs: [], // workout log entries { ts, type, note, done }
  achievements: [], // earned badge keys
  unit: { id: null, members: [] }, // leader view (local demo)
};

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    return { ...structuredClone(DEFAULT), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
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
