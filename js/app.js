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

// ── View: ASSESS ─────────────────────────────────────────────────────────
VIEWS.assess = function () {
  return `
  <div class="grid two">
    <div class="card">
      <h2>Your details</h2>
      <p class="hint">Enter as many or as few components as you like — the assessment adapts.</p>
      <div class="row">
        <div><label>Sex</label>
          <select id="f-sex">
            <option value="male" ${draft.sex==='male'?'selected':''}>Male</option>
            <option value="female" ${draft.sex==='female'?'selected':''}>Female</option>
          </select></div>
        <div><label>Age</label><input id="f-age" type="number" min="17" max="65" value="${draft.age}"></div>
      </div>
      <div class="row">
        <div><label>Height (in)</label><input id="f-height" type="number" min="58" max="80" value="${state.profile.height}"></div>
        <div><label>Weight (lb)</label><input id="f-weight" type="number" min="91" max="250" value="${state.profile.weight}"></div>
        <div><label>Waist (in)</label><input id="f-waist" type="number" min="25" max="60" step="0.5" value="${state.profile.waist}"></div>
      </div>

      ${['aerobic','strength','core'].map(compInputBlock).join('')}

      <div class="chat">
        <input id="nl" placeholder="Or just type: '28M ran 1.5 in 12:40, 38 pushups, 2:10 plank, 185 lbs, 34 waist'">
        <button class="btn secondary" id="nl-go">Parse</button>
      </div>
      <div style="margin-top:12px; display:flex; gap:8px;">
        <button class="btn" id="save">Save assessment</button>
      </div>
    </div>

    <div class="card" id="result-card">${resultPanel()}</div>
  </div>`;
};

function compInputBlock(comp) {
  const c = draft.components[comp];
  const opts = EXERCISES[comp].map((e) => `<option value="${e.id}" ${c.exercise===e.id?'selected':''}>${e.label}</option>`).join('');
  return `
  <div class="row" style="align-items:flex-end">
    <div><label>${cap(comp)} — exercise</label><select data-ex="${comp}">${opts}</select></div>
    <div><label>Result</label><input data-raw="${comp}" value="${rawInputValue(comp)}" placeholder="${TIME_EXERCISES.has(c.exercise)?'mm:ss':'reps / count'}"></div>
  </div>`;
}

function resultPanel() {
  const r = currentResult();
  const body = currentBody();
  if (r.enteredCount === 0) {
    return `<h2>Assessment</h2><p class="hint">Enter at least one component to see your score, pass/fail status and where to improve.</p>${bodyPanel(body)}`;
  }
  const band = r.band;
  const pct = r.composite;
  const passLine = r.complete
    ? (r.pass ? `<span class="badge tag-ok">PASS</span>` : `<span class="badge tag-fail">FAIL</span>`)
    : `<span class="pill">${r.enteredCount}/3 components — partial</span>`;

  const bars = ['aerobic','strength','core'].map((comp) => {
    const c = r.components[comp];
    if (!c) return `<div class="comp-bar"><div class="top"><span>${cap(comp)}</span><span class="pill">not entered</span></div></div>`;
    const fillPct = (c.points / c.maxPoints) * 100;
    const color = c.meetsMin ? (fillPct>=85?'var(--accent-2)':'var(--accent)') : 'var(--fail)';
    return `<div class="comp-bar">
      <div class="top"><span>${cap(comp)} <span class="pill">${EXERCISES[comp].find(e=>e.id===c.exercise).label.split(' (')[0]}</span></span>
        <span>${c.points}/${c.maxPoints} pts ${c.meetsMin?'':'<span class="tag-fail">⚠ below min</span>'}</span></div>
      <div class="track"><div class="fill" style="width:${fillPct}%;background:${color}"></div></div>
    </div>`;
  }).join('');

  const gaps = gapAnalysis(r);
  const improve = gaps.map((g) => {
    const tag = !g.meetsMin ? `<span class="tag-fail">${g.toMinText}</span>`
      : `<span class="muted">+${g.headroom} pts available</span>`;
    return `<li><b>${cap(g.component)}</b> — ${tag}</li>`;
  }).join('');

  return `
  <h2>Assessment</h2>
  <div class="score-hero">
    <div class="dial" style="--pct:${pct};--dial-color:${band.color}">
      <div class="num"><b>${r.composite}</b><span>/ 100</span></div>
    </div>
    <div>
      <div class="badge" style="background:${band.color};color:#02132b">${band.label}</div>
      <div style="margin:8px 0">${passLine}</div>
      <div class="hint">${verdictText(r)}</div>
    </div>
  </div>
  <div style="margin-top:14px">${bars}</div>
  <h3 style="margin-top:16px">Where to improve <span class="pill">cheapest points first</span></h3>
  <ul class="clean">${improve}</ul>
  ${bodyPanel(body)}
  <p class="cite">Scored under ${STANDARD.reference} ruleset v${STANDARD.rulesetVersion}.</p>`;
}

function verdictText(r) {
  if (!r.complete) return `Partial picture from ${r.enteredCount} component(s). Enter all three for an official-style pass/fail.`;
  if (r.pass) return r.composite >= 90 ? 'Strong — comfortably passing. Push for max where headroom remains.'
    : 'Passing. Tighten the weakest component to build margin.';
  if (r.anyComponentFail) return 'Composite aside, a component is below its minimum — that alone fails the test. Fix it first.';
  return `Below the ${STANDARD.passComposite}-point composite. Focus on your highest-weight gaps.`;
}

function bodyPanel(body) {
  if (!body.checked && !body.waist) return '';
  const hw = body.hwPass == null ? '' :
    `<div class="kv"><span>Height/Weight screen</span><span class="${body.hwPass?'tag-ok':'tag-fail'}">${body.hwPass?'Pass':`Over by ${body.overBy} lb`}</span></div>
     <div class="kv"><span>Max weight @ ${state.profile.height}"</span><span>${body.maxWeight} lb (BMI ${body.bmi})</span></div>`;
  const wa = body.waistPass == null ? '' :
    `<div class="kv"><span>Waist screen</span><span class="${body.waistPass?'tag-ok':'tag-fail'}">${body.waistPass?'Pass':`Over by ${body.waistOverBy}"`}</span></div>`;
  const flag = body.needsWeightLoss ? `<div class="warn-box" style="margin-top:8px">Body-composition flagged — your training plan will include a weight-loss block.</div>` : '';
  return `<h3 style="margin-top:16px">Body composition</h3><div class="muted-box">${hw}${wa}${flag}</div>`;
}

WIRES.assess = function () {
  $('#f-sex').onchange = (e) => { draft.sex = e.target.value; state.profile.sex = e.target.value; refreshResult(); };
  $('#f-age').oninput = (e) => { draft.age = clamp(+e.target.value||25,17,65); refreshResult(); };
  $('#f-height').oninput = (e) => { state.profile.height = clamp(+e.target.value||70,58,80); refreshResult(); };
  $('#f-weight').oninput = (e) => { state.profile.weight = clamp(+e.target.value||180,91,250); refreshResult(); };
  $('#f-waist').oninput = (e) => { state.profile.waist = clamp(+e.target.value||36,25,60); refreshResult(); };
  app.querySelectorAll('[data-ex]').forEach((sel) => {
    sel.onchange = (e) => {
      const comp = e.target.dataset.ex;
      draft.components[comp].exercise = e.target.value;
      draft.components[comp].raw = ''; // unit may change
      render();
    };
  });
  app.querySelectorAll('[data-raw]').forEach((inp) => {
    inp.oninput = (e) => { setRaw(e.target.dataset.raw, e.target.value.trim()); refreshResult(); };
  });
  $('#nl-go').onclick = () => {
    const parsed = parseNaturalLanguage($('#nl').value);
    applyParsed(parsed);
    render();
    toast('Parsed what I could from your message.');
  };
  $('#save').onclick = () => {
    const r = currentResult();
    if (r.enteredCount === 0) return toast('Enter at least one component first.');
    persistProfile();
    store.recordAssessment(state, structuredClone(draft), r, Date.now());
    const newBadges = store.evaluateBadges(state, r);
    persist();
    toast(newBadges.length ? `Saved! Earned: ${newBadges.map(b=>b.label).join(', ')}` : 'Assessment saved.');
  };
};

function refreshResult() {
  const card = document.getElementById('result-card');
  if (card) card.innerHTML = resultPanel();
}
function persistProfile() {
  state.profile = { ...state.profile, sex: draft.sex, age: draft.age };
  persist();
}
function applyParsed(p) {
  if (p.sex) { draft.sex = p.sex; state.profile.sex = p.sex; }
  if (p.age) draft.age = p.age;
  if (p.height) state.profile.height = p.height;
  if (p.weight) state.profile.weight = p.weight;
  if (p.waist) state.profile.waist = p.waist;
  for (const comp of ['aerobic','strength','core']) {
    if (p.components[comp]) draft.components[comp] = { ...p.components[comp] };
  }
}

