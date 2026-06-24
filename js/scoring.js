// PFAi — scoring engine
// Converts raw performance into points, composites them, and derives pass/fail,
// band, gap analysis and what-if projections.

import {
  STANDARD,
  bandFor,
  tableFor,
  componentsFor,
  WHTR,
  MAX_WEIGHT_BY_HEIGHT,
  WAIST_MAX,
} from './data/standards.js';

// Linear interpolation across an anchor table. Anchors are [raw, points].
// Works regardless of anchor ordering.
function interpolatePoints(table, raw) {
  const anchors = [...table.anchors].sort((a, b) => a[0] - b[0]);
  const lo = anchors[0];
  const hi = anchors[anchors.length - 1];
  // Out of range → clamp to the points stored at the nearest anchor. Points are
  // stored alongside their raw value, so this is correct for both directions
  // (e.g. a run faster than the max-point time scores the max-point value).
  if (raw <= lo[0]) return lo[1];
  if (raw >= hi[0]) return hi[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i];
    const [x1, y1] = anchors[i + 1];
    if (raw >= x0 && raw <= x1) {
      const t = (raw - x0) / (x1 - x0 || 1);
      return y0 + t * (y1 - y0);
    }
  }
  return 0;
}

// Score a single component from a raw value.
// Returns null when no value was provided (the user may enter however many
// components they please).
export function scoreComponent(sex, age, component, exercise, raw) {
  if (raw == null || raw === '' || Number.isNaN(Number(raw))) return null;
  const table = tableFor(sex, age, component, exercise);
  if (!table) return null;
  const value = Number(raw);
  const points = Math.max(0, Math.min(table.maxPoints, interpolatePoints(table, value)));
  const meetsMin =
    table.betterDirection === 'higher' ? value >= table.min : value <= table.min;
  return {
    component,
    exercise,
    raw: value,
    unit: table.unit,
    points: round1(points),
    maxPoints: table.maxPoints,
    min: table.min,
    betterDirection: table.betterDirection,
    meetsMin,
    table,
  };
}

// Score the waist-to-height-ratio body component (PFRA-2026).
export function scoreBody(body, maxPoints = WHTR.maxPoints) {
  if (!body || !body.waist || !body.height) return null;
  const ratio = body.waist / body.height;
  const points = Math.max(0, Math.min(maxPoints, interpolatePoints(WHTR, ratio)));
  return {
    component: 'body', exercise: 'whtr', raw: ratio, unit: 'ratio',
    points: round1(points), maxPoints, min: WHTR.min, betterDirection: 'lower',
    meetsMin: ratio < WHTR.min, // scores above zero
    table: { official: true, anchors: WHTR.anchors, betterDirection: 'lower' },
  };
}

// Full assessment, driven by the active ruleset's components.
// `input` = { sex, age, components:{ aerobic:{exercise,raw},… }, body:{waist,height} }
export function scoreAssessment(input) {
  const { sex, age, components = {}, body } = input;
  const comps = componentsFor();
  const scored = {};
  let total = 0;
  let anyComponentFail = false;
  let enteredCount = 0;

  for (const comp of comps) {
    let r = null;
    if (comp.kind === 'body') {
      r = scoreBody(body, comp.weight);
    } else {
      const sel = components[comp.id];
      if (sel && sel.raw != null && sel.raw !== '') {
        r = scoreComponent(sex, age, comp.id, sel.exercise, sel.raw);
      }
    }
    scored[comp.id] = r;
    if (r) {
      total += r.points;
      enteredCount++;
      if (!r.meetsMin) anyComponentFail = true;
    }
  }

  const composite = round1(total);
  const requiredCount = comps.length;
  const complete = enteredCount === requiredCount;
  const meetsComposite = composite >= STANDARD.passComposite;
  const pass = complete ? meetsComposite && !anyComponentFail : null; // null = incomplete
  const band = bandFor(composite);

  return {
    sex,
    age,
    rulesetVersion: STANDARD.rulesetVersion,
    components: scored,
    composite,
    maxComposite: comps.reduce((s, c) => s + (c.weight ?? 0), 0) || 100,
    enteredCount,
    requiredCount,
    complete,
    meetsComposite,
    anyComponentFail,
    pass,
    band,
  };
}

// Gap analysis: smallest raw improvement to (a) clear a failed minimum and
// (b) reach the next composite band. Returns per-component suggestions plus a
// "cheapest points" ranking using the component weighting.
export function gapAnalysis(result) {
  const gaps = [];
  for (const comp of Object.keys(result.components)) {
    const r = result.components[comp];
    if (!r) continue;
    const headroom = r.maxPoints - r.points;
    let toMin = null;
    if (!r.meetsMin && r.unit !== 'ratio') {
      toMin = formatDelta(r, r.min);
    }
    // raw needed for +3 more points (whichever is reachable); skip body (ratio).
    const nextRaw = r.unit === 'ratio' ? null : rawForPoints(r, Math.min(r.maxPoints, r.points + 3));
    gaps.push({
      component: comp,
      points: r.points,
      maxPoints: r.maxPoints,
      headroom: round1(headroom),
      meetsMin: r.meetsMin,
      toMinText: toMin,
      pointsPerRawHint: nextRaw,
      // efficiency: headroom is literally extra composite points available here
      efficiency: round1(headroom),
    });
  }
  // Cheapest points first = where the most composite headroom remains.
  // Aerobic (weight 60) usually dominates, which is the strategic insight.
  gaps.sort((a, b) => b.efficiency - a.efficiency);
  return gaps;
}

// Find the raw performance value that yields `targetPoints` (inverse lookup).
function rawForPoints(r, targetPoints) {
  const anchors = [...r.table.anchors].sort((a, b) => a[1] - b[1]); // by points
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i];
    const [x1, y1] = anchors[i + 1];
    if (targetPoints >= y0 && targetPoints <= y1) {
      const t = (targetPoints - y0) / (y1 - y0 || 1);
      const raw = x0 + t * (x1 - x0);
      return { targetPoints: round1(targetPoints), raw: Math.round(raw), unit: r.unit };
    }
  }
  return null;
}

function formatDelta(r, targetRaw) {
  const diff = Math.abs(targetRaw - r.raw);
  if (r.unit === 'seconds') {
    const sign = r.betterDirection === 'lower' ? 'faster' : 'longer';
    return `${fmtTime(diff)} ${sign} (reach ${fmtTime(targetRaw)})`;
  }
  const sign = r.betterDirection === 'higher' ? 'more' : 'fewer';
  return `${Math.round(diff)} ${sign} (reach ${Math.round(targetRaw)})`;
}

// What-if: clone the input, override one or more component raws, rescore.
export function whatIf(baseInput, overrides) {
  const next = {
    ...baseInput,
    components: { ...baseInput.components },
  };
  for (const [comp, raw] of Object.entries(overrides)) {
    if (next.components[comp]) {
      next.components[comp] = { ...next.components[comp], raw };
    }
  }
  return scoreAssessment(next);
}

// Body-composition screen. Returns pass/fail for height/weight + secondary waist.
export function bodyComposition({ sex, height, weight, waist }) {
  const out = { checked: false };
  if (height && weight) {
    const h = clampHeight(Math.round(height));
    const maxW = MAX_WEIGHT_BY_HEIGHT[h];
    out.checked = true;
    out.maxWeight = maxW;
    out.weight = weight;
    out.hwPass = weight <= maxW;
    out.bmi = round1((weight / (height * height)) * 703);
    out.overBy = out.hwPass ? 0 : Math.round(weight - maxW);
  }
  if (waist) {
    const max = WAIST_MAX[sex];
    out.waist = waist;
    out.waistMax = max;
    out.waistPass = waist <= max;
    out.waistOverBy = out.waistPass ? 0 : round1(waist - max);
  }
  // Fails screening only if BOTH height/weight and waist screens fail (when
  // both present) — mirrors the spec's "fails H/W AND subsequent waist" branch.
  if (out.hwPass != null && out.waistPass != null) {
    out.needsWeightLoss = !out.hwPass && !out.waistPass;
  } else if (out.hwPass != null) {
    out.needsWeightLoss = !out.hwPass;
  } else {
    out.needsWeightLoss = false;
  }
  return out;
}

function clampHeight(h) {
  if (h < 58) return 58;
  if (h > 80) return 80;
  return h;
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

export function fmtTime(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function parseTime(str) {
  if (typeof str === 'number') return str;
  if (!str) return null;
  if (String(str).includes(':')) {
    const [m, s] = String(str).split(':').map(Number);
    return m * 60 + (s || 0);
  }
  return Number(str);
}
