// PFAi — app shell: state, routing, and views.
import { scoreAssessment, gapAnalysis, whatIf, bodyComposition, fmtTime, parseTime, round1 }
  from './scoring.js';
import { STANDARD, BANDS, tableFor } from './data/standards.js';
import { generateRegimen, daysUntil } from './regimen.js';
import { parseNaturalLanguage } from './parser.js';
import * as store from './storage.js';
import { estimateProportions, detectorError } from './camera.js';

const EXERCISES = {
  aerobic: [{ id: 'run_1_5mi', label: '1.5-mile run (mm:ss)' }, { id: 'hamr', label: 'HAMR shuttles' }],
  strength: [{ id: 'pushups', label: 'Push-ups (reps)' }, { id: 'hrp', label: 'Hand-release push-ups' }],
  core: [
    { id: 'situps', label: 'Sit-ups (reps)' },
    { id: 'crunches', label: 'Cross-leg crunches' },
    { id: 'plank', label: 'Forearm plank (mm:ss)' },
  ],
};
const TIME_EXERCISES = new Set(['run_1_5mi', 'plank']);

let state = store.loadState();
// Working assessment input (not yet saved).
let draft = {
  sex: state.profile.sex,
  age: state.profile.age,
  components: { aerobic: { exercise: 'run_1_5mi', raw: '' }, strength: { exercise: 'pushups', raw: '' }, core: { exercise: 'plank', raw: '' } },
};
let currentView = 'assess';

const app = document.getElementById('app');
const $ = (s, r = document) => r.querySelector(s);

// ── Routing ──────────────────────────────────────────────────────────────
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if (!btn) return;
  currentView = btn.dataset.view;
  [...e.currentTarget.children].forEach((b) => b.classList.toggle('active', b === btn));
  render();
});

function render() {
  renderCountdown();
  const fn = VIEWS[currentView] || VIEWS.assess;
  app.innerHTML = fn();
  WIRES[currentView]?.();
}

function renderCountdown() {
  const c = document.getElementById('countdown');
  const d = daysUntil(state.goal.date);
  if (d == null) { c.innerHTML = `<span class="pill">No test date set</span>`; return; }
  c.innerHTML = d > 0
    ? `Test day in <strong>${d}</strong> days`
    : `Test window <strong>now</strong>`;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function rawInputValue(comp) {
  const c = draft.components[comp];
  if (c.raw === '' || c.raw == null) return '';
  return TIME_EXERCISES.has(c.exercise) ? fmtTime(c.raw) : c.raw;
}
function setRaw(comp, val) {
  const c = draft.components[comp];
  if (val === '') { c.raw = ''; return; }
  c.raw = TIME_EXERCISES.has(c.exercise) ? parseTime(val) : Number(val);
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
function persist() { store.saveState(state); }

function currentResult() {
  return scoreAssessment(draft);
}
function currentBody() {
  return bodyComposition({
    sex: draft.sex, height: state.profile.height,
    weight: state.profile.weight, waist: state.profile.waist,
  });
}

