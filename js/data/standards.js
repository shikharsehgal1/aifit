// PFAi — USAF Physical Fitness Assessment standards & scoring data
//
// ⚠️ IMPORTANT — DATA PROVENANCE
// The numeric tables below are *approximations* structured to mirror how the
// real USAF assessment works. They are NOT the official charts. Before this
// product is used to advise real airmen, every anchor in this file must be
// replaced with the verbatim values from the current DAFMAN 36-2905
// (Department of the Air Force Manual, "Air Force Physical Fitness Program").
// The shape of the data (anchors + interpolation) is built so official numbers
// drop straight in without touching the scoring engine.

export const STANDARD = {
  authority: 'U.S. Air Force',
  reference: 'DAFMAN 36-2905, Air Force Physical Fitness Program',
  // Bump this whenever the embedded tables change so stored assessments can be
  // tagged with the ruleset they were scored under.
  rulesetVersion: '0.1.0-approx',
  effectiveNote:
    'Tables are APPROXIMATE placeholders pending entry of official DAFMAN 36-2905 charts.',
  // Component weighting toward the 100-point composite.
  weights: { aerobic: 60, strength: 20, core: 20 },
  // Composite pass mark.
  passComposite: 75,
};

// Clean, non-overlapping performance bands for the composite score.
export const BANDS = [
  { key: 'fail', label: 'Fail', min: 0, max: 74.99, color: '#d64545' },
  { key: 'marginal', label: 'Marginal', min: 75, max: 79.99, color: '#e08a1e' },
  { key: 'satisfactory', label: 'Satisfactory', min: 80, max: 89.99, color: '#3b82c4' },
  { key: 'excellent', label: 'Excellent', min: 90, max: 99.99, color: '#2f9e6f' },
  { key: 'max', label: 'Maximum', min: 100, max: 100, color: '#1f7a52' },
];

export function bandFor(score) {
  return BANDS.find((b) => score >= b.min && score <= b.max) || BANDS[0];
}

// ── Component anchor tables ──────────────────────────────────────────────
// Each anchor is [rawPerformance, points]. We linearly interpolate between
// anchors. For time-based events (run, plank) the engine knows lower/higher is
// better via `betterDirection`.
//
// `min` is the raw performance threshold below which the component is FAILED
// regardless of composite (mirrors the USAF per-component minimum rule).

const BASE = {
  male: {
    aerobic: {
      run_1_5mi: {
        unit: 'seconds',
        betterDirection: 'lower',
        maxPoints: 60,
        min: 816, // 13:36
        anchors: [
          [552, 60], // 9:12
          [600, 56],
          [660, 50],
          [720, 42],
          [780, 33],
          [816, 25], // minimum to pass component
          [900, 12],
          [1020, 0],
        ],
      },
      hamr: {
        unit: 'shuttles',
        betterDirection: 'higher',
        maxPoints: 60,
        min: 46,
        anchors: [
          [100, 60],
          [85, 54],
          [72, 46],
          [60, 36],
          [46, 25],
          [30, 10],
          [0, 0],
        ],
      },
    },
    strength: {
      pushups: {
        unit: 'reps',
        betterDirection: 'higher',
        maxPoints: 20,
        min: 33,
        anchors: [
          [67, 20],
          [55, 17],
          [45, 14],
          [40, 11],
          [33, 8],
          [20, 3],
          [0, 0],
        ],
      },
      hrp: {
        unit: 'reps',
        betterDirection: 'higher',
        maxPoints: 20,
        min: 18,
        anchors: [
          [40, 20],
          [33, 17],
          [27, 14],
          [22, 11],
          [18, 8],
          [10, 3],
          [0, 0],
        ],
      },
    },
    core: {
      situps: {
        unit: 'reps',
        betterDirection: 'higher',
        maxPoints: 20,
        min: 33,
        anchors: [
          [58, 20],
          [50, 17],
          [45, 14],
          [40, 11],
          [33, 8],
          [20, 3],
          [0, 0],
        ],
      },
      crunches: {
        unit: 'reps',
        betterDirection: 'higher',
        maxPoints: 20,
        min: 20,
        anchors: [
          [45, 20],
          [38, 17],
          [31, 14],
          [25, 11],
          [20, 8],
          [10, 3],
          [0, 0],
        ],
      },
      plank: {
        unit: 'seconds',
        betterDirection: 'higher',
        maxPoints: 20,
        min: 65,
        anchors: [
          [210, 20], // 3:30
          [170, 17],
          [130, 14],
          [95, 11],
          [65, 8],
          [40, 3],
          [0, 0],
        ],
      },
    },
  },
  female: {
    aerobic: {
      run_1_5mi: {
        unit: 'seconds',
        betterDirection: 'lower',
        maxPoints: 60,
        min: 936, // 15:36
        anchors: [
          [660, 60], // 11:00
          [720, 55],
          [780, 48],
          [840, 40],
          [900, 31],
          [936, 25],
          [1020, 12],
          [1140, 0],
        ],
      },
      hamr: {
        unit: 'shuttles',
        betterDirection: 'higher',
        maxPoints: 60,
        min: 34,
        anchors: [
          [82, 60],
          [70, 54],
          [56, 46],
          [44, 36],
          [34, 25],
          [20, 10],
          [0, 0],
        ],
      },
    },
    strength: {
      pushups: {
        unit: 'reps',
        betterDirection: 'higher',
        maxPoints: 20,
        min: 18,
        anchors: [
          [47, 20],
          [38, 17],
          [30, 14],
          [24, 11],
          [18, 8],
          [10, 3],
          [0, 0],
        ],
      },
      hrp: {
        unit: 'reps',
        betterDirection: 'higher',
        maxPoints: 20,
        min: 10,
        anchors: [
          [30, 20],
          [24, 17],
          [19, 14],
          [14, 11],
          [10, 8],
          [5, 3],
          [0, 0],
        ],
      },
    },
    core: {
      situps: {
        unit: 'reps',
        betterDirection: 'higher',
        maxPoints: 20,
        min: 32,
        anchors: [
          [54, 20],
          [46, 17],
          [40, 14],
          [36, 11],
          [32, 8],
          [18, 3],
          [0, 0],
        ],
      },
      crunches: {
        unit: 'reps',
        betterDirection: 'higher',
        maxPoints: 20,
        min: 18,
        anchors: [
          [42, 20],
          [35, 17],
          [29, 14],
          [23, 11],
          [18, 8],
          [9, 3],
          [0, 0],
        ],
      },
      plank: {
        unit: 'seconds',
        betterDirection: 'higher',
        maxPoints: 20,
        min: 50,
        anchors: [
          [200, 20],
          [160, 17],
          [120, 14],
          [85, 11],
          [50, 8],
          [30, 3],
          [0, 0],
        ],
      },
    },
  },
};

// Age relaxation: older brackets get more forgiving standards. These are
// transparent approximations applied to the <25 base tables — replace with
// explicit per-bracket official tables when available.
export const AGE_BRACKETS = [
  { key: 'u25', label: 'Under 25', test: (a) => a < 25, timeFactor: 1.0, repFactor: 1.0 },
  { key: '25_29', label: '25–29', test: (a) => a >= 25 && a < 30, timeFactor: 1.03, repFactor: 0.93 },
  { key: '30_39', label: '30–39', test: (a) => a >= 30 && a < 40, timeFactor: 1.07, repFactor: 0.85 },
  { key: '40_49', label: '40–49', test: (a) => a >= 40 && a < 50, timeFactor: 1.12, repFactor: 0.76 },
  { key: '50p', label: '50+', test: (a) => a >= 50, timeFactor: 1.18, repFactor: 0.66 },
];

export function bracketFor(age) {
  return AGE_BRACKETS.find((b) => b.test(age)) || AGE_BRACKETS[0];
}

// Returns the (sex, age)-adjusted table for one exercise.
export function tableFor(sex, age, component, exercise) {
  const base = BASE[sex]?.[component]?.[exercise];
  if (!base) return null;
  const br = bracketFor(age);
  const isTime = base.unit === 'seconds';
  const isRun = exercise === 'run_1_5mi';
  // For runs, older => allowed slower (multiply seconds up).
  // For reps / plank-hold, older => fewer reps/less time required (multiply down).
  const scale = (perf) => {
    if (isRun) return Math.round(perf * br.timeFactor);
    if (isTime) return Math.round(perf * br.repFactor); // plank hold requirement eases
    return Math.round(perf * br.repFactor);
  };
  return {
    ...base,
    bracket: br,
    min: scale(base.min),
    anchors: base.anchors.map(([perf, pts]) => [scale(perf), pts]),
  };
}

// ── Body-composition (height/weight) screening ──────────────────────────
// Approximate max-weight-by-height screening table (inches -> max lbs).
// Official screening values must come from current AF guidance. Note: the AF
// largely retired the scored abdominal-circumference (waist) component; waist
// here is treated as a secondary screen, not a scored component.
export const MAX_WEIGHT_BY_HEIGHT = {
  58: 152, 59: 157, 60: 163, 61: 169, 62: 174, 63: 180, 64: 186, 65: 192,
  66: 198, 67: 204, 68: 210, 69: 216, 70: 222, 71: 229, 72: 235, 73: 242,
  74: 249, 75: 256, 76: 263, 77: 270, 78: 277, 79: 284, 80: 291,
};

// Secondary waist screen (inches). Approximate.
export const WAIST_MAX = { male: 39.0, female: 35.5 };
