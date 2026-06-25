// PFAi — USAF Physical Fitness Assessment standards & scoring data
import { PFRA2026 } from './pfra2026.js';
//
// ── DATA PROVENANCE ────────────────────────────────────────────────────────
// LEGACY ruleset (the scored PFA in use through early 2026): the 1.5-mile run,
// 1-minute push-ups and 1-minute sit-up tables below carry the OFFICIAL
// component minimums and maximum-point thresholds for all nine 5-year age
// brackets, both sexes, transcribed from the published USAF Fitness Assessment
// Scoring charts ("Final Version"). Intermediate point values are interpolated
// between official anchor points (the run anchors follow the published
// low-risk / moderate / high-risk breakpoints) and may differ from the printed
// chart by up to ~1–2 points; the pass minimums and 100-point/max thresholds
// are exact. Alternate events (HAMR, hand-release push-ups, cross-leg reverse
// crunch, forearm plank) are marked `official:false` — reasonable estimates
// pending verbatim transcription of their charts.
//
// PFRA-2026 ruleset is a clearly-labelled PREVIEW of the new program (effective
// 1 Mar 2026: 2-mile run 50 / waist-to-height 20 / strength 15 / core 15). Its
// point tables are provisional pending publication — use LEGACY for scored
// results.
//
// Sources: USAF Fitness Assessment Scoring charts (AFROTC/AFPC reproductions),
// 2022 Final Version. See README for citations.

// ── Age brackets (official 5-year cohorts) ──────────────────────────────────
export const AGE_BRACKETS = [
  { key: 'u25',   label: 'Under 25', test: (a) => a < 25 },
  { key: '25_29', label: '25–29',    test: (a) => a >= 25 && a < 30 },
  { key: '30_34', label: '30–34',    test: (a) => a >= 30 && a < 35 },
  { key: '35_39', label: '35–39',    test: (a) => a >= 35 && a < 40 },
  { key: '40_44', label: '40–44',    test: (a) => a >= 40 && a < 45 },
  { key: '45_49', label: '45–49',    test: (a) => a >= 45 && a < 50 },
  { key: '50_54', label: '50–54',    test: (a) => a >= 50 && a < 55 },
  { key: '55_59', label: '55–59',    test: (a) => a >= 55 && a < 60 },
  { key: '60p',   label: '60+',      test: (a) => a >= 60 },
];
export function bracketFor(age) {
  return AGE_BRACKETS.find((b) => b.test(age)) || AGE_BRACKETS[0];
}

// ── Official 1.5-mile run anchors [seconds, points] ─────────────────────────
// Fastest→60, then low-risk-end, high-risk-start, and the minimum-pass time→35.
const RUN = {
  male: {
    u25:   [[552, 60], [753, 53.5], [840, 46.5], [950, 35]],
    '25_29': [[562, 60], [753, 54], [840, 49], [982, 35]],
    '30_34': [[574, 60], [773, 54], [865, 48], [1017, 35]],
    '35_39': [[585, 60], [773, 54.5], [865, 50.5], [1053, 35]],
    '40_44': [[598, 60], [840, 53.5], [950, 46.5], [1094, 35]],
    '45_49': [[610, 60], [840, 54], [950, 49], [1136, 35]],
    '50_54': [[637, 60], [892, 54], [1017, 48], [1233, 35]],
    '55_59': [[651, 60], [865, 55], [982, 52], [1288, 35]],
    '60p':   [[682, 60], [982, 54.5], [1136, 47], [1348, 35]],
  },
  female: {
    u25:   [[623, 60], [892, 53.5], [1017, 46], [1136, 35]],
    '25_29': [[637, 60], [892, 54], [1017, 49], [1183, 35]],
    '30_34': [[651, 60], [920, 54], [1054, 47], [1233, 35]],
    '35_39': [[666, 60], [920, 54.5], [1054, 49.5], [1288, 35]],
    '40_44': [[682, 60], [982, 54], [1136, 48], [1348, 35]],
    '45_49': [[698, 60], [982, 54.5], [1136, 50.5], [1414, 35]],
    '50_54': [[773, 60], [1094, 55], [1233, 49.5], [1486, 35]],
    '55_59': [[794, 60], [1094, 55.5], [1233, 52], [1566, 35]],
    '60p':   [[840, 60], [1183, 55.5], [1414, 47], [1647, 35]],
  },
};

// Official push-up / sit-up [min reps, max-point reps] per bracket.
const PUSHUP = {
  male: { u25: [30, 67], '25_29': [27, 62], '30_34': [24, 57], '35_39': [21, 51], '40_44': [18, 44], '45_49': [15, 44], '50_54': [12, 44], '55_59': [12, 37], '60p': [11, 30] },
  female: { u25: [15, 47], '25_29': [14, 47], '30_34': [11, 46], '35_39': [10, 42], '40_44': [8, 38], '45_49': [7, 37], '50_54': [6, 35], '55_59': [5, 28], '60p': [4, 21] },
};
const SITUP = {
  male: { u25: [39, 58], '25_29': [38, 56], '30_34': [36, 54], '35_39': [34, 52], '40_44': [31, 50], '45_49': [28, 48], '50_54': [25, 46], '55_59': [22, 44], '60p': [19, 42] },
  female: { u25: [35, 54], '25_29': [31, 50], '30_34': [26, 45], '35_39': [24, 43], '40_44': [21, 41], '45_49': [19, 35], '50_54': [17, 32], '55_59': [12, 32], '60p': [8, 31] },
};

// Build a rep-event table from official min/max using the published near-min
// ladder (min→1 or 3, then +3 reps→10 or 12 pts), linear to the max.
function repTable(min, max, kneePts, minPts) {
  return {
    unit: 'reps', betterDirection: 'higher', maxPoints: 20, min, official: true,
    anchors: [[0, 0], [min, minPts], [Math.min(min + 3, max), kneePts], [max, 20]],
  };
}
function runTable(anchors) {
  return { unit: 'seconds', betterDirection: 'lower', maxPoints: 60, min: anchors[anchors.length - 1][0], official: true, anchors };
}

// ── Estimated alternate-event bases (official:false) ────────────────────────
// Scaled per bracket by a light factor; clearly flagged as estimates.
const ALT_FACTOR = { u25: 1.0, '25_29': 0.95, '30_34': 0.9, '35_39': 0.85, '40_44': 0.78, '45_49': 0.72, '50_54': 0.66, '55_59': 0.6, '60p': 0.54 };
const ALT_BASE = {
  male: {
    hamr: { unit: 'shuttles', betterDirection: 'higher', maxPoints: 60, min: 36, anchors: [[100, 60], [72, 53], [56, 46], [36, 35], [20, 20], [0, 0]] },
    hrp: { unit: 'reps', betterDirection: 'higher', maxPoints: 20, min: 15, anchors: [[0, 0], [15, 1], [18, 10], [40, 20]] },
    crunches: { unit: 'reps', betterDirection: 'higher', maxPoints: 20, min: 21, anchors: [[0, 0], [21, 10], [33, 15], [49, 20]] },
    plank: { unit: 'seconds', betterDirection: 'higher', maxPoints: 20, min: 65, anchors: [[0, 0], [65, 10], [125, 15], [215, 20]] },
  },
  female: {
    hamr: { unit: 'shuttles', betterDirection: 'higher', maxPoints: 60, min: 22, anchors: [[83, 60], [56, 53], [42, 46], [22, 35], [12, 20], [0, 0]] },
    hrp: { unit: 'reps', betterDirection: 'higher', maxPoints: 20, min: 6, anchors: [[0, 0], [6, 1], [9, 10], [31, 20]] },
    crunches: { unit: 'reps', betterDirection: 'higher', maxPoints: 20, min: 11, anchors: [[0, 0], [11, 10], [29, 15], [47, 20]] },
    plank: { unit: 'seconds', betterDirection: 'higher', maxPoints: 20, min: 50, anchors: [[0, 0], [50, 10], [120, 15], [210, 20]] },
  },
};
function altTable(sex, exercise, bracketKey) {
  const base = ALT_BASE[sex]?.[exercise];
  if (!base) return null;
  const f = ALT_FACTOR[bracketKey] ?? 1;
  return {
    ...base, official: false,
    min: Math.round(base.min * f),
    anchors: base.anchors.map(([raw, pts]) => [Math.round(raw * f), pts]),
  };
}

// ── PFRA-2026 tables ───────────────────────────────────────────────────────
// PFRA-2026 exact step tables, built from the verbatim official charts
// (see js/data/pfra2026.js). Each event scores by exact threshold lookup.
const EX2PFRA = { run_2mi: 'run2mi', hamr: 'hamr', pushups: 'pushup', hrp: 'hrp', situps: 'situp', crunches: 'crunch', plank: 'plank' };
function pfra2026Table(sex, brKey, exercise) {
  const d = PFRA2026[EX2PFRA[exercise]];
  if (!d) return null;
  const col = d[sex === 'female' ? 'F' : 'M']?.[brKey];
  if (!col) return null;
  const anchors = d.ladder.map((pts, i) => [col[i], pts]).filter((a) => a[0] != null);
  return { unit: d.unit, betterDirection: d.dir, maxPoints: d.ladder[0], min: anchors[anchors.length - 1][0], step: true, official: true, anchors };
}
// 2.0 km walk — official MAX times (pass/fail alternate cardio for run-exempt
// members). Coarse age brackets. Seconds.
const WALK = {
  M: { u30: 976, '30_39': 978, '40_49': 983, '50_59': 1000, '60p': 1018 },
  F: { u30: 1042, '30_39': 1048, '40_49': 1069, '50_59': 1091, '60p': 1133 },
};
function walkBracket(age) {
  if (age < 30) return 'u30';
  if (age < 40) return '30_39';
  if (age < 50) return '40_49';
  if (age < 60) return '50_59';
  return '60p';
}
function walkTable(sex, age) {
  const max = WALK[sex === 'female' ? 'F' : 'M'][walkBracket(age)];
  return { unit: 'seconds', betterDirection: 'lower', passFail: true, maxTime: max, min: max, maxPoints: 50, official: true, anchors: [[max, 0]] };
}

// Waist-to-height ratio (20 pts) — official universal curve, age/sex independent.
export function bodyTable() {
  const d = PFRA2026.whtr;
  return {
    unit: 'ratio', betterDirection: 'lower', maxPoints: 20, min: 0.60, step: true, official: true,
    anchors: d.ladder.map((pts, i) => [d.vals[i], pts]),
  };
}

// ── Bands ────────────────────────────────────────────────────────────────
// Official composite categories: Excellent ≥90, Satisfactory 75–89.9,
// Unsatisfactory <75. (`marginal`/`max` are finer UI sub-bands only.)
const LEGACY_BANDS = [
  { key: 'fail', label: 'Unsatisfactory', min: 0, max: 74.99, color: '#f87171' },
  { key: 'marginal', label: 'Marginal', min: 75, max: 79.99, color: '#fbbf24' },
  { key: 'satisfactory', label: 'Satisfactory', min: 80, max: 89.99, color: '#60a5fa' },
  { key: 'excellent', label: 'Excellent', min: 90, max: 99.99, color: '#34d399' },
  { key: 'max', label: 'Maximum', min: 100, max: 100, color: '#bef264' },
];

// ── Rulesets ────────────────────────────────────────────────────────────
export const RULESETS = {
  legacy: {
    id: 'legacy',
    label: 'Legacy PFA (60 / 20 / 20)',
    preview: false,
    standard: {
      authority: 'U.S. Air Force',
      reference: 'DAFMAN 36-2905, USAF Fitness Assessment Scoring (Final Version)',
      rulesetVersion: '1.0.0-legacy',
      effectiveNote: 'Official component minimums and maximum-point thresholds for all nine 5-year age brackets; intermediate points interpolated between official anchors.',
      weights: { aerobic: 60, strength: 20, core: 20 },
      passComposite: 75,
    },
    bands: LEGACY_BANDS,
    components: [
      { id: 'aerobic', label: 'Aerobic', weight: 60, exercises: [{ id: 'run_1_5mi', label: '1.5-mile run' }, { id: 'hamr', label: 'HAMR shuttles' }] },
      { id: 'strength', label: 'Strength', weight: 20, exercises: [{ id: 'pushups', label: 'Push-ups' }, { id: 'hrp', label: 'Hand-release push-ups' }] },
      { id: 'core', label: 'Core', weight: 20, exercises: [{ id: 'situps', label: 'Sit-ups' }, { id: 'crunches', label: 'Cross-leg crunch' }, { id: 'plank', label: 'Forearm plank' }] },
    ],
  },
  pfa2026: {
    id: 'pfa2026',
    label: 'PFRA 2026',
    preview: false,
    standard: {
      authority: 'U.S. Air Force',
      reference: 'DAFMAN 36-2905, Physical Fitness Readiness Assessment (eff. 1 Mar 2026)',
      rulesetVersion: '2.0.0-pfra2026',
      effectiveNote: '100-point model: 2-mile run 50, waist-to-height ratio 20, strength 15, core 15. All event tables (2-mile run, 20m HAMR, push-up, hand-release push-up, sit-up, cross-leg reverse crunch, forearm plank, WHtR) are the verbatim official charts, every age bracket and sex, scored by exact threshold lookup.',
      weights: { aerobic: 50, body: 20, strength: 15, core: 15 },
      passComposite: 75,
    },
    bands: LEGACY_BANDS,
    components: [
      { id: 'aerobic', label: 'Cardio', weight: 50, exercises: [
        { id: 'run_2mi', label: '2-mile run' },
        { id: 'hamr', label: '20m HAMR shuttles' },
        { id: 'walk_2k', label: '2 km walk (pass/fail)' },
      ] },
      { id: 'body', label: 'Waist-to-height', weight: 20, kind: 'body', exercises: [] },
      { id: 'strength', label: 'Strength', weight: 15, exercises: [
        { id: 'hrp', label: 'Hand-release push-ups' },
        { id: 'pushups', label: 'Push-ups' },
      ] },
      { id: 'core', label: 'Core', weight: 15, exercises: [
        { id: 'plank', label: 'Forearm plank' },
        { id: 'crunches', label: 'Cross-leg reverse crunch' },
        { id: 'situps', label: 'Sit-ups' },
      ] },
    ],
  },
};

// AFSPECWAR/EOD elevated standard: every member is held to the male under-25
// PFRA column (the elevated bar in the official chart), regardless of age/sex.
RULESETS.pfra_sof = {
  ...structuredClone(RULESETS.pfa2026),
  id: 'pfra_sof',
  label: 'PFRA · AFSPECWAR/EOD',
  force: { sex: 'male', bracket: 'u25' },
};
RULESETS.pfra_sof.standard = {
  ...RULESETS.pfa2026.standard,
  rulesetVersion: '2.0.0-pfra2026-sof',
  reference: 'DAFMAN 36-2905 PFRA — AFSPECWAR/EOD elevated standards',
  effectiveNote: 'AFSPECWAR/EOD elevated standards: all members are scored against the official male under-25 PFRA column (verbatim), regardless of age or sex. Waist-to-height uses the same universal curve.',
};

// Active ruleset — switchable. STANDARD/BANDS are live `let` bindings so
// importers see the active set after setRuleset().
let activeId = 'legacy';
export let STANDARD = RULESETS.legacy.standard;
export let BANDS = RULESETS.legacy.bands;

export function setRuleset(id) {
  if (!RULESETS[id]) return false;
  activeId = id;
  STANDARD = RULESETS[id].standard;
  BANDS = RULESETS[id].bands;
  return true;
}
export function getRulesetId() { return activeId; }
export function getRuleset() { return RULESETS[activeId]; }

// Altitude adjustment for the aerobic run. The USAF allows extra run time at
// high-altitude installations; the exact per-band correction isn't embedded
// here, so this is an ESTIMATE: ~8 s added per 1000 ft above 3000 ft.
let altitudeFt = 0;
export function setAltitude(ft) { altitudeFt = Math.max(0, Math.min(15000, Math.round(ft) || 0)); }
export function getAltitude() { return altitudeFt; }
function runAltitudeOffset() { return altitudeFt > 3000 ? Math.round((altitudeFt - 3000) / 1000 * 8) : 0; }
export function listRulesets() {
  return Object.values(RULESETS).map((r) => ({ id: r.id, label: r.label, preview: r.preview }));
}
export function componentsFor(rulesetId = activeId) { return RULESETS[rulesetId].components; }

export function bandFor(score) {
  return BANDS.find((b) => score >= b.min && score <= b.max) || BANDS[0];
}

// Scale a 20-point rep/alt table to a different component max (e.g. 2026's
// 15-point strength/core). No-op when target is 20.
function scaleMax(table, targetMax) {
  if (!table || targetMax === table.maxPoints) return table;
  const f = targetMax / table.maxPoints;
  return { ...table, maxPoints: targetMax, anchors: table.anchors.map(([raw, pts]) => [raw, Math.round(pts * f * 10) / 10]) };
}

// ── Table lookup (sex, age, component, exercise) ───────────────────────────
export function tableFor(sex, age, component, exercise) {
  const rs = RULESETS[activeId];
  // AFSPECWAR/EOD forces everyone to the male under-25 column.
  const uSex = rs.force?.sex || sex;
  const uAge = rs.force?.bracket === 'u25' ? 22 : age;
  const br = bracketFor(uAge);
  const is2026 = activeId === 'pfa2026' || activeId === 'pfra_sof';
  let t = null;

  // 2 km walk — pass/fail alternate cardio (uses actual age/sex, coarse brackets).
  if (is2026 && exercise === 'walk_2k') {
    t = walkTable(uSex, uAge);
  }
  // PFRA-2026 — exact official step tables for every event.
  else if (is2026) {
    t = pfra2026Table(uSex, br.key, exercise);
  }
  // Legacy official primary events + estimated alternates.
  else if (exercise === 'run_1_5mi' && RUN[sex]?.[br.key]) t = runTable(RUN[sex][br.key]);
  else if (exercise === 'pushups' && PUSHUP[sex]?.[br.key]) { const [min, max] = PUSHUP[sex][br.key]; t = repTable(min, max, 10, 1); }
  else if (exercise === 'situps' && SITUP[sex]?.[br.key]) { const [min, max] = SITUP[sex][br.key]; t = repTable(min, max, 12, 3); }
  else t = altTable(sex, exercise, br.key);

  if (!t) return null;

  // Relax run times at altitude (estimate; doesn't apply to step tables yet).
  const off = runAltitudeOffset();
  if (off && t.betterDirection === 'lower') {
    t = { ...t, min: t.min + off, anchors: t.anchors.map(([s, p]) => [s + off, p]), altitudeOffset: off };
  }
  return { ...t, bracket: br };
}

// ── Body-composition (height/weight) screening ──────────────────────────
// Approximate max-weight-by-height screening table (inches -> max lbs).
export const MAX_WEIGHT_BY_HEIGHT = {
  58: 152, 59: 157, 60: 163, 61: 169, 62: 174, 63: 180, 64: 186, 65: 192,
  66: 198, 67: 204, 68: 210, 69: 216, 70: 222, 71: 229, 72: 235, 73: 242,
  74: 249, 75: 256, 76: 263, 77: 270, 78: 277, 79: 284, 80: 291,
};
// Secondary waist screen (inches). Approximate.
export const WAIST_MAX = { male: 39.0, female: 35.5 };
