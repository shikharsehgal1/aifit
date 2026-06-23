// PFAi — training regimen generator.
// Produces a week-by-week plan that prioritises the cheapest composite points
// (aerobic carries the most weight) and respects the user's available days,
// equipment, injuries and body-composition status.

import { gapAnalysis, fmtTime } from './scoring.js';

const SESSION_LIBRARY = {
  aerobic: {
    gym: ['Treadmill intervals 6×400m @ goal pace', 'Tempo run 20–25 min', 'Zone-2 easy run 30–40 min'],
    home: ['Outdoor intervals 6×400m', 'Tempo run 20–25 min', 'Easy run 30–40 min'],
    none: ['Run intervals (any flat stretch)', 'Brisk walk/run 30 min', 'Stair repeats 15 min'],
  },
  strength: {
    gym: ['Bench + push-up ladder 5×submax', 'Incline press 4×8 + push-up EMOM', 'Push-up greasing-the-groove (5 sets/day)'],
    home: ['Push-up ladder 5×submax', 'Decline push-ups 4×10 + dips', 'Push-up greasing-the-groove (5 sets/day)'],
    none: ['Push-up ladder 5×submax', 'Push-up greasing-the-groove (5 sets/day)', 'Incline push-ups for volume'],
  },
  core: {
    gym: ['Plank progression 3×max hold', 'Weighted sit-ups 4×20', 'Hollow holds + leg raises 4 sets'],
    home: ['Plank progression 3×max hold', 'Sit-ups 4×25', 'Hollow holds + leg raises 4 sets'],
    none: ['Plank progression 3×max hold', 'Sit-ups 4×25', 'Hollow holds 4 sets'],
  },
};

const INJURY_BLOCKS = {
  knee: ['intervals', 'stair', 'run'],
  shoulder: ['bench', 'press', 'push-up', 'dip'],
  back: ['sit-up', 'weighted', 'leg raise'],
};

function filterForInjuries(items, injuries) {
  const inj = (injuries || '').toLowerCase();
  const blocked = [];
  for (const [k, words] of Object.entries(INJURY_BLOCKS)) {
    if (inj.includes(k)) blocked.push(...words);
  }
  if (!blocked.length) return items;
  const safe = items.filter((s) => !blocked.some((w) => s.toLowerCase().includes(w)));
  return safe.length ? safe : items; // never return empty
}

export function generateRegimen(result, opts) {
  const { goalDate, daysPerWeek = 4, equipment = 'gym', injuries = '', body = {} } = opts || {};
  const weeks = weeksUntil(goalDate);
  const gaps = gapAnalysis(result);

  // Allocate weekly focus by remaining headroom (cheapest points first).
  const focusOrder = gaps.map((g) => g.component);
  // If body composition flags weight loss, fold in a conditioning/diet emphasis.
  const weightLoss = !!body.needsWeightLoss;

  const plan = [];
  const totalWeeks = weeks || 8;
  for (let wk = 1; wk <= totalWeeks; wk++) {
    const sessions = [];
    const intensity = phaseFor(wk, totalWeeks);
    for (let d = 0; d < daysPerWeek; d++) {
      // rotate focus, weighting the highest-headroom component
      const comp = focusOrder[d % focusOrder.length] || 'aerobic';
      const pool = filterForInjuries(
        SESSION_LIBRARY[comp][equipment] || SESSION_LIBRARY[comp].none,
        injuries
      );
      sessions.push({
        day: d + 1,
        component: comp,
        prescription: pool[(wk + d) % pool.length],
        intensity,
      });
    }
    if (weightLoss) {
      sessions.push({
        day: daysPerWeek + 1,
        component: 'conditioning',
        prescription: 'Low-impact zone-2 cardio 30–40 min + 300–500 kcal daily deficit',
        intensity,
      });
    }
    plan.push({ week: wk, phase: intensity, sessions });
  }

  return {
    weeks: totalWeeks,
    goalDate,
    focusOrder,
    weightLoss,
    rationale: rationale(gaps, weightLoss),
    plan,
  };
}

function rationale(gaps, weightLoss) {
  const lines = [];
  const top = gaps[0];
  if (top) {
    lines.push(
      `Primary focus: ${top.component} — it has the most unclaimed composite points (${top.headroom} available).`
    );
  }
  const failing = gaps.filter((g) => !g.meetsMin);
  for (const f of failing) {
    lines.push(`⚠️ ${f.component} is below the minimum — ${f.toMinText}. This must clear to pass.`);
  }
  if (weightLoss) {
    lines.push('Body-composition screen flagged: plan includes a calorie deficit + conditioning block.');
  }
  return lines;
}

function phaseFor(wk, total) {
  const frac = wk / total;
  if (frac <= 0.4) return 'Base';
  if (frac <= 0.8) return 'Build';
  if (frac < 1) return 'Peak';
  return 'Taper';
}

export function weeksUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const ms = target - now;
  if (ms <= 0) return 1;
  return Math.max(1, Math.ceil(ms / (7 * 24 * 3600 * 1000)));
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  return Math.ceil((target - now) / (24 * 3600 * 1000));
}
