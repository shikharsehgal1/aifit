// PFAi — training regimen generator.
// Produces a week-by-week plan that prioritises the cheapest composite points
// (aerobic carries the most weight) and respects the user's available days,
// equipment, injuries and body-composition status.

import { gapAnalysis } from './scoring.js';
import { componentsFor } from './data/standards.js';

const label = (id) => componentsFor().find((c) => c.id === id)?.title ?? id;

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
  // ── Army AFT events ──
  mdl: {
    gym: ['Trap-bar deadlift 5×3 @ 80–85% of 3RM', 'Romanian deadlift 4×6 + farmer carries 4×40 m', 'Deadlift 3RM practice — work up to a crisp triple'],
    home: ['Kettlebell swings 5×15 + goblet squats 4×10', 'Single-leg RDL 4×8/side (loaded backpack)', 'Glute bridges 4×12 + hip-hinge drills'],
    none: ['Single-leg RDL 4×8/side (loaded backpack)', 'Backpack swings 5×15 + split squats 4×10', 'Glute bridges 4×15 + hip-hinge drills'],
  },
  hrp: {
    gym: ['Hand-release push-up ladder 5×submax', 'HRP test-pace EMOM 10 min + bench 4×8', 'HRP greasing-the-groove (5 sets/day) + dips 3×10'],
    home: ['Hand-release push-up ladder 5×submax', 'HRP test-pace EMOM 10 min', 'HRP greasing-the-groove (5 sets/day) + decline push-ups'],
    none: ['Hand-release push-up ladder 5×submax', 'HRP test-pace EMOM 10 min', 'HRP greasing-the-groove (5 sets/day)'],
  },
  sdc: {
    gym: ['SDC rehearsal: sprint / sled drag / lateral / carry / sprint ×3', 'Sled drag 6×25 m + kettlebell carry 4×50 m', 'Shuttle sprints 8×25 m + lateral shuffles 6×25 m'],
    home: ['Shuttle sprints 10×25 m + lateral shuffles 6×25 m', 'Heavy carry 4×50 m + backward drags (loaded bag) 6×25 m', 'SDC rehearsal with improvised drag + carry ×3'],
    none: ['Shuttle sprints 10×25 m', 'Lateral shuffles 6×25 m + bear crawls 4×20 m', 'Backpack carry 4×50 m + sprints 6×25 m'],
  },
  plk: {
    gym: ['Plank progression 3×max hold', 'Weighted plank 4×45 s + hollow holds', 'Dead bugs + side planks 4 sets'],
    home: ['Plank progression 3×max hold', 'Plank shoulder taps 4×45 s + hollow holds', 'Dead bugs + side planks 4 sets'],
    none: ['Plank progression 3×max hold', 'Plank shoulder taps 4×45 s + hollow holds', 'Dead bugs + side planks 4 sets'],
  },
  run2: {
    gym: ['2-mile pace intervals 6×400 m (treadmill)', 'Tempo run 20–25 min', 'Zone-2 easy run 30–40 min'],
    home: ['2-mile pace intervals 6×400 m', 'Tempo run 20–25 min', 'Easy run 30–40 min'],
    none: ['2-mile pace intervals 6×400 m', 'Tempo run 20–25 min', 'Easy run 30–40 min'],
  },
};

const INJURY_BLOCKS = {
  knee: ['intervals', 'stair', 'run', 'sprint', 'shuttle', 'lateral', 'squat'],
  shoulder: ['bench', 'press', 'push-up', 'dip', 'hrp'],
  back: ['sit-up', 'weighted', 'leg raise', 'deadlift', 'rdl', 'swing', 'drag', 'carry'],
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
  // AFT: focus events take every other session; the rest rotate through the
  // remaining days so no event is dropped entirely.
  const tranche = gaps.some((g) => g.focus != null);
  const focusComps = gaps.filter((g) => g.focus).map((g) => g.component);
  const otherComps = gaps.filter((g) => !g.focus).map((g) => g.component);
  const pick = (wk, d) => {
    if (!tranche) return focusOrder[d % focusOrder.length] || 'aerobic';
    if (!focusComps.length) return otherComps[(d + wk) % otherComps.length];
    if (!otherComps.length) return focusComps[(d + wk) % focusComps.length];
    const half = Math.floor(d / 2);
    return d % 2 === 0
      ? focusComps[(half + wk) % focusComps.length]
      : otherComps[(half + wk * Math.max(1, Math.floor(daysPerWeek / 2))) % otherComps.length];
  };
  // If body composition flags weight loss, fold in a conditioning/diet emphasis.
  const weightLoss = !!body.needsWeightLoss;

  const plan = [];
  const totalWeeks = weeks || 8;
  for (let wk = 1; wk <= totalWeeks; wk++) {
    const sessions = [];
    const intensity = phaseFor(wk, totalWeeks);
    for (let d = 0; d < daysPerWeek; d++) {
      // rotate focus, weighting the highest-headroom component
      const comp = pick(wk, d);
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
  if (gaps.some((g) => g.focus != null)) return trancheRationale(gaps, weightLoss);
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

function trancheRationale(gaps, weightLoss) {
  const lines = [];
  const failing = gaps.filter((g) => !g.meetsMin);
  const focus = gaps.filter((g) => g.focus);
  if (failing.length) {
    lines.push(`Priority: ${failing.map((g) => label(g.component)).join(', ')} — below the 60-point event minimum. These must clear to pass, so they get every other session.`);
  } else if (focus.length) {
    lines.push(`Priority: ${focus.map((g) => label(g.component)).join(', ')} — your lowest band (${focus[0].band.label}). These get every other session; the other events rotate to hold their scores.`);
  } else {
    lines.push('Every entered event is maxed — the plan maintains all five.');
  }
  if (weightLoss) {
    lines.push('Waist-to-height ratio is 0.55 or higher (Army limit): plan includes a calorie deficit + conditioning block.');
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
