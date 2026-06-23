// PFAi — conversational natural-language intake.
// Rule-based (no external API): extracts as many fields as it can from free
// text so users can type "I'm a 28M, ran 1.5 in 12:40, did 38 pushups and a
// 2:10 plank, 185 lbs, 34 inch waist" instead of filling a form.

export function parseNaturalLanguage(text) {
  const t = ' ' + text.toLowerCase().replace(/[,]/g, ' ') + ' ';
  const out = { components: {} };

  // Sex
  if (/\b(female|woman|\bf\b|\d+\s*f\b)\b/.test(t)) out.sex = 'female';
  else if (/\b(male|man|\bm\b|\d+\s*m\b)\b/.test(t)) out.sex = 'male';

  // Age — "28M", "age 28", "i'm 28", "28 yo/yrs"
  const age =
    t.match(/\b(\d{2})\s*[mf]\b/) ||
    t.match(/age\s*(\d{2})/) ||
    t.match(/\b(\d{2})\s*(?:yo|yrs?|years?)\b/) ||
    t.match(/i['’]?m\s*(\d{2})/);
  if (age) out.age = clamp(+age[1], 17, 65);

  // Height — 5'10", 5 ft 10, 70 in
  const ftin = t.match(/(\d)\s*['’ft]+\s*(\d{1,2})/);
  const inches = t.match(/\b(\d{2})\s*(?:in|inch|inches|")\b\s*(?:tall|height)?/);
  if (ftin) out.height = clamp(+ftin[1] * 12 + +ftin[2], 58, 80);
  else if (inches && +inches[1] >= 58 && +inches[1] <= 80 && /tall|height/.test(t))
    out.height = +inches[1];

  // Weight — 185 lbs
  const w = t.match(/\b(\d{2,3})\s*(?:lbs?|pounds?)\b/);
  if (w) out.weight = clamp(+w[1], 91, 250);

  // Waist — 34 inch waist / waist 34
  const waist =
    t.match(/waist\s*(?:is|of)?\s*(\d{2}(?:\.\d)?)/) ||
    t.match(/(\d{2}(?:\.\d)?)\s*(?:in|inch|inches|")\s*waist/);
  if (waist) out.waist = clamp(+waist[1], 25, 60);

  // Run — "ran 1.5 in 12:40", "1.5 mile 12:40", "run 12:40"
  const run = t.match(/(?:ran|run|1\.5|mile)[^0-9]*(\d{1,2}:\d{2})/);
  if (run) out.components.aerobic = { exercise: 'run_1_5mi', raw: toSeconds(run[1]) };
  const hamr = t.match(/(\d{1,3})\s*shuttles?/);
  if (hamr && !out.components.aerobic)
    out.components.aerobic = { exercise: 'hamr', raw: +hamr[1] };

  // Push-ups / HRP
  const hrp = t.match(/(\d{1,3})\s*(?:hand[- ]?release|hrp)/);
  const pu = t.match(/(\d{1,3})\s*push/);
  if (hrp) out.components.strength = { exercise: 'hrp', raw: +hrp[1] };
  else if (pu) out.components.strength = { exercise: 'pushups', raw: +pu[1] };

  // Core — plank (time), sit-ups, crunches
  const plank = t.match(/(\d{1,2}:\d{2})\s*plank|plank[^0-9]*(\d{1,2}:\d{2})/);
  const su = t.match(/(\d{1,3})\s*sit[- ]?ups?/);
  const cr = t.match(/(\d{1,3})\s*crunch/);
  if (plank) out.components.core = { exercise: 'plank', raw: toSeconds(plank[1] || plank[2]) };
  else if (su) out.components.core = { exercise: 'situps', raw: +su[1] };
  else if (cr) out.components.core = { exercise: 'crunches', raw: +cr[1] };

  return out;
}

function toSeconds(mmss) {
  const [m, s] = mmss.split(':').map(Number);
  return m * 60 + (s || 0);
}
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
