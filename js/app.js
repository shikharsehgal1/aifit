// PFAi — app shell: state, routing, and views.
import { scoreAssessment, gapAnalysis, whatIf, bodyComposition, fmtTime, parseTime, round1 }
  from './scoring.js';
import { STANDARD, BANDS, tableFor, setRuleset, getRulesetId, getRuleset, listRulesets, componentsFor }
  from './data/standards.js';
import { generateRegimen, daysUntil } from './regimen.js';
import { parseNaturalLanguage } from './parser.js';
import * as store from './storage.js';
import { estimateProportions, detectorError } from './camera.js';

const TIME_EXERCISES = new Set(['run_1_5mi', 'run_2mi', 'plank']);
// Exercise options for a component come from the active ruleset.
function exercisesFor(comp) {
  return componentsFor().find((c) => c.id === comp)?.exercises ?? [];
}
function exLabel(comp, id) {
  return exercisesFor(comp).find((e) => e.id === id)?.label ?? id;
}

let state = store.loadState();
// Activate the persisted ruleset before deriving anything from STANDARD.
setRuleset(state.settings.ruleset || 'legacy');
// Working assessment input (not yet saved). Rehydrate from the most recent
// saved assessment so What-If / Plan stay usable across reloads.
let draft = (() => {
  const last = state.assessments.at(-1)?.input;
  if (last?.components) return structuredClone(last);
  return {
    sex: state.profile.sex,
    age: state.profile.age,
    components: { aerobic: { exercise: 'run_1_5mi', raw: '' }, strength: { exercise: 'pushups', raw: '' }, core: { exercise: 'plank', raw: '' } },
  };
})();
// Snap each component to an exercise the active ruleset actually offers,
// clearing the raw value when the event changes (units may differ).
function normalizeDraftToRuleset() {
  for (const comp of ['aerobic', 'strength', 'core']) {
    const opts = exercisesFor(comp);
    const cur = draft.components[comp];
    if (opts.length && !opts.some((e) => e.id === cur.exercise)) {
      draft.components[comp] = { exercise: opts[0].id, raw: '' };
    }
  }
}
normalizeDraftToRuleset();
const VALID_VIEWS = ['assess', 'simulator', 'plan', 'progress', 'scan', 'leader', 'about'];
function viewFromHash() {
  const v = location.hash.replace(/^#\/?/, '');
  return VALID_VIEWS.includes(v) ? v : 'assess';
}
let currentView = viewFromHash();

const app = document.getElementById('app');
const $ = (s, r = document) => r.querySelector(s);

// ── Routing ──────────────────────────────────────────────────────────────
// Hash-based so refresh, back/forward and deep links all work.
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if (!btn) return;
  location.hash = btn.dataset.view; // triggers the hashchange handler below
});
window.addEventListener('hashchange', () => {
  currentView = viewFromHash();
  syncTabs();
  app.scrollIntoView({ block: 'start', behavior: 'smooth' });
  render();
});
function syncTabs() {
  document.querySelectorAll('#tabs button[data-view]').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === currentView));
}

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

// ── Hero / landing ─────────────────────────────────────────────────────────
function heroMarkup() {
  const w = STANDARD.weights;
  return `
  <section class="hero">
    <div class="hero-eyebrow">USAF · ${STANDARD.reference.split(',')[0]}</div>
    <h2 class="hero-title">Know your score<br>before test day.</h2>
    <p class="hero-sub">Enter your run, strength and core numbers — PFAi computes your weighted
      composite, flags every component minimum, and shows the cheapest points to your next
      band. Instant, private, and fully on-device.</p>
    <div class="hero-stats">
      <div class="hstat"><b>${w.aerobic}/${w.strength}/${w.core}</b><span>Aerobic / Strength / Core</span></div>
      <div class="hstat"><b>≥${STANDARD.passComposite}</b><span>Composite to pass</span></div>
      <div class="hstat"><b>${BANDS.length}</b><span>Performance bands</span></div>
      <div class="hstat"><b>100%</b><span>On-device · no upload</span></div>
    </div>
  </section>`;
}

// ── View: ASSESS ─────────────────────────────────────────────────────────
VIEWS.assess = function () {
  return `
  ${heroMarkup()}
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
  const opts = exercisesFor(comp).map((e) => `<option value="${e.id}" ${c.exercise===e.id?'selected':''}>${e.label}</option>`).join('');
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
    const estTag = c.table?.official === false ? ' <span class="pill" title="estimated — official chart pending">est</span>' : '';
    return `<div class="comp-bar">
      <div class="top"><span>${cap(comp)} <span class="pill">${exLabel(comp, c.exercise)}</span>${estTag}</span>
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

// ── View: SIMULATOR (what-if) ──────────────────────────────────────────────
VIEWS.simulator = function () {
  const r = currentResult();
  if (r.enteredCount === 0)
    return `<div class="card"><h2>What-If Simulator</h2><p class="hint">Enter your current numbers on the Assess tab first, then come back to experiment.</p><div style="margin-top:12px"><a class="btn secondary" href="#assess">Go to Assess →</a></div></div>`;
  const sliders = ['aerobic','strength','core'].map((comp) => {
    const c = r.components[comp];
    if (!c) return '';
    const t = tableFor(draft.sex, draft.age, comp, c.exercise);
    const raws = t.anchors.map(a=>a[0]);
    const lo = Math.min(...raws), hi = Math.max(...raws);
    const disp = TIME_EXERCISES.has(c.exercise) ? fmtTime(c.raw) : c.raw;
    return `<div class="comp-bar">
      <div class="top"><span>${cap(comp)} — <span id="sv-${comp}">${disp}</span></span><span id="sp-${comp}">${c.points} pts</span></div>
      <input type="range" data-sim="${comp}" min="${lo}" max="${hi}" step="${TIME_EXERCISES.has(c.exercise)?1:1}" value="${c.raw}">
    </div>`;
  }).join('');
  return `<div class="card">
    <h2>What-If Simulator</h2>
    <p class="hint">Drag to see how each change moves your composite and pass/fail in real time. Best place to find your cheapest points.</p>
    <div class="score-hero" style="margin:10px 0">
      <div class="dial" id="sim-dial" style="--pct:${r.composite};--dial-color:${r.band.color}">
        <div class="num"><b id="sim-score">${r.composite}</b><span>/ 100</span></div>
      </div>
      <div id="sim-verdict"></div>
    </div>
    ${sliders}
  </div>`;
};
WIRES.simulator = function () {
  const overrides = {};
  const update = () => {
    const res = whatIf(draft, overrides);
    $('#sim-score').textContent = res.composite;
    const dial = $('#sim-dial');
    dial.style.setProperty('--pct', res.composite);
    dial.style.setProperty('--dial-color', res.band.color);
    $('#sim-verdict').innerHTML =
      `<div class="badge" style="background:${res.band.color};color:#02132b">${res.band.label}</div>
       <div style="margin-top:6px">${res.complete?(res.pass?'<span class="tag-ok">PASS</span>':'<span class="tag-fail">FAIL</span>'):'<span class="pill">partial</span>'}</div>`;
    for (const comp of Object.keys(overrides)) {
      const c = res.components[comp];
      $(`#sp-${comp}`).textContent = `${c.points} pts`;
      $(`#sv-${comp}`).textContent = TIME_EXERCISES.has(c.exercise) ? fmtTime(c.raw) : c.raw;
    }
  };
  app.querySelectorAll('[data-sim]').forEach((sl) => {
    sl.oninput = (e) => { overrides[e.target.dataset.sim] = +e.target.value; update(); };
  });
  update();
};

// ── View: PLAN ──────────────────────────────────────────────────────────
VIEWS.plan = function () {
  return `<div class="grid two">
    <div class="card">
      <h2>Plan setup</h2>
      <label>Goal / test date</label><input type="date" id="g-date" value="${state.goal.date||''}">
      <label>Target</label>
      <select id="g-target">
        ${['pass','satisfactory','excellent'].map(t=>`<option value="${t}" ${state.goal.target===t?'selected':''}>${cap(t)}</option>`).join('')}
      </select>
      <div class="row">
        <div><label>Days / week</label><input type="number" id="s-days" min="2" max="7" value="${state.settings.daysPerWeek}"></div>
        <div><label>Equipment</label><select id="s-equip">
          ${['gym','home','none'].map(x=>`<option ${state.settings.equipment===x?'selected':''}>${x}</option>`).join('')}
        </select></div>
      </div>
      <label>Injuries / limitations</label>
      <input id="s-inj" placeholder="e.g. knee, shoulder, back" value="${state.settings.injuries||''}">
      <div style="margin-top:12px"><button class="btn" id="gen">Generate plan</button></div>
    </div>
    <div class="card" id="plan-card"><h2>Your regimen</h2><p class="hint">Set your details and generate a periodised plan focused on your highest-value gaps.</p></div>
  </div>`;
};
WIRES.plan = function () {
  $('#g-date').onchange = (e)=>{ state.goal.date=e.target.value; persist(); renderCountdown(); };
  $('#g-target').onchange = (e)=>{ state.goal.target=e.target.value; persist(); };
  $('#s-days').oninput = (e)=>{ state.settings.daysPerWeek=clamp(+e.target.value||4,2,7); persist(); };
  $('#s-equip').onchange = (e)=>{ state.settings.equipment=e.target.value; persist(); };
  $('#s-inj').oninput = (e)=>{ state.settings.injuries=e.target.value; persist(); };
  $('#gen').onclick = () => {
    const r = currentResult();
    if (r.enteredCount===0) return toast('Add your scores on the Assess tab first.');
    const reg = generateRegimen(r, {
      goalDate: state.goal.date, daysPerWeek: state.settings.daysPerWeek,
      equipment: state.settings.equipment, injuries: state.settings.injuries,
      body: currentBody(),
    });
    $('#plan-card').innerHTML = planMarkup(reg);
    wirePlanLog();
  };
};
function planMarkup(reg) {
  const colors = { aerobic:'var(--accent)', strength:'var(--warn)', core:'var(--accent-2)', conditioning:'#b06fd0' };
  const weeks = reg.plan.map((w) => `
    <div class="week">
      <h3><span>Week ${w.week}</span><span class="pill">${w.phase}</span></h3>
      ${w.sessions.map((s,i)=>`<div class="session">
        <span class="dot" style="background:${colors[s.component]||'#888'}"></span>
        <span style="flex:1"><b>${cap(s.component)}</b> — ${s.prescription}</span>
        <input type="checkbox" data-log="${w.week}-${i}" title="mark done">
      </div>`).join('')}
    </div>`).join('');
  const legend = `<div class="legend">${Object.entries(colors).map(([k,c]) =>
    `<span><i style="background:${c}"></i>${cap(k)}</span>`).join('')}</div>`;
  return `<h2>Your regimen <span class="pill">${reg.weeks} weeks</span></h2>
    <div class="muted-box" style="margin-bottom:14px">${reg.rationale.map(l=>`<div>${l}</div>`).join('')}</div>
    ${legend}
    ${weeks}`;
}
function wirePlanLog() {
  app.querySelectorAll('[data-log]').forEach((cb) => {
    cb.onchange = (e) => {
      if (e.target.checked) {
        state.logs.push({ ts: Date.now(), type: 'session', note: e.target.dataset.log, done: true });
        const earned = store.evaluateBadges(state, state.assessments.at(-1)?.result);
        persist();
        toast(earned.length ? `Logged! Earned: ${earned.map(b=>b.label).join(', ')}` : 'Workout logged.');
      }
    };
  });
}

// ── View: PROGRESS ─────────────────────────────────────────────────────────
VIEWS.progress = function () {
  const comp = store.trendSeries(state, 'composite');
  const series = ['aerobic','strength','core'].map((k)=>({k,data:store.trendSeries(state,k)}));
  const badges = state.achievements.map((k)=>`<span class="badge" style="background:var(--panel-2)">🏅 ${store.badgeLabel(k)}</span>`).join(' ') || '<span class="hint">No badges yet — save an assessment to start.</span>';
  const latest = comp.at(-1)?.value;
  const peak = comp.length ? Math.max(...comp.map(p=>p.value)) : null;
  return `<div class="grid two">
    <div class="card">
      <h2>Composite trend</h2>
      ${comp.length ? `<div class="trend-head"><div><b>${latest}</b><span>latest</span></div><div><b>${peak}</b><span>peak</span></div><div><b>${comp.length}</b><span>logged</span></div></div>${sparkline(comp)}` : '<p class="hint">Save assessments over time to see your trend.</p>'}
      <div style="margin-top:14px">${series.map(s=>s.data.length?`<div class="comp-bar"><div class="top"><span>${cap(s.k)}</span><span>${s.data.at(-1).value} pts</span></div>${sparkline(s.data,40)}</div>`:'').join('')}</div>
    </div>
    <div class="card">
      <h2>Achievements</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${badges}</div>
      <h3 style="margin-top:18px">Workout log</h3>
      <div class="kv"><span>Sessions completed</span><b>${state.logs.filter(l=>l.done).length}</b></div>
      <div class="kv"><span>Assessments saved</span><b>${state.assessments.length}</b></div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn secondary" id="export">Export data</button>
        <button class="btn secondary" id="reset">Reset all</button>
      </div>
    </div>
  </div>`;
};
WIRES.progress = function () {
  $('#export').onclick = () => {
    const blob = new Blob([store.exportJSON(state)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'pfai-data.json'; a.click();
  };
  $('#reset').onclick = () => {
    if (confirm('Erase all saved assessments, logs and settings on this device?')) {
      localStorage.clear(); state = store.loadState(); toast('All data cleared.'); render();
    }
  };
};
function sparkline(points, h=90) {
  if (points.length < 2) {
    const v = points[0]?.value ?? 0;
    return `<svg class="spark" viewBox="0 0 300 ${h}"><text x="6" y="${h/2}" fill="#8b8b94" font-size="12" font-family="monospace">${v} · need 2+ points</text></svg>`;
  }
  const vals = points.map(p=>p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max-min || 1;
  const step = 300/(points.length-1);
  const y = (p)=> (h-6-((p.value-min)/range)*(h-16)).toFixed(1);
  const path = points.map((p,i)=>`${i?'L':'M'}${(i*step).toFixed(1)},${y(p)}`).join(' ');
  const area = `M0,${h} L${path.slice(1)} L300,${h} Z`;
  const dots = h>=90 ? points.map((p,i)=>`<circle cx="${(i*step).toFixed(1)}" cy="${y(p)}" r="2.5" fill="var(--accent)"/>`).join('') : '';
  return `<svg class="spark" viewBox="0 0 300 ${h}" preserveAspectRatio="none">
    <path d="${area}" fill="var(--accent)" opacity="0.08"/>
    <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
    ${dots}
  </svg>`;
}

// ── View: BODY SCAN (experimental) ─────────────────────────────────────────
VIEWS.scan = function () {
  return `<div class="card">
    <h2>Body Scan <span class="beta">experimental</span></h2>
    <div class="warn-box">This is an experimental on-device estimate, <b>not</b> a measurement or medical tool, and <b>not</b> valid for official body-composition determinations. A single 2D photo cannot replace an in-person tape test. Nothing is uploaded — all processing happens in your browser. Always verify with a real tape measurement.</div>
    <div class="scan-wrap" style="margin-top:12px">
      <video id="cam" autoplay playsinline muted></video>
      <canvas id="overlay"></canvas>
    </div>
    <div class="row" style="margin-top:10px">
      <button class="btn" id="cam-start">Start camera</button>
      <button class="btn secondary" id="cam-capture">Estimate proportions</button>
    </div>
    <div id="scan-out" style="margin-top:12px"></div>
  </div>`;
};
WIRES.scan = function () {
  const video = $('#cam'); const out = $('#scan-out'); let stream = null;
  $('#cam-start').onclick = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640 } });
      video.srcObject = stream;
      out.innerHTML = '<p class="hint">Stand back so your whole body (head to ankles) is in frame, good lighting, plain background.</p>';
    } catch (err) {
      out.innerHTML = `<div class="warn-box">Camera unavailable: ${err.message}. You can still enter your waist manually on the Assess tab.</div>`;
    }
  };
  $('#cam-capture').onclick = async () => {
    if (!stream) return toast('Start the camera first.');
    out.innerHTML = '<p class="hint">Analysing…</p>';
    try {
      const est = await estimateProportions(video, state.profile.height);
      if (!est.ok) { out.innerHTML = `<div class="warn-box">${est.reason}</div>`; return; }
      out.innerHTML = `
        <div class="muted-box">
          <div class="kv"><span>Waist proxy (rough)</span><b>${est.waistProxyIn ?? '—'} in</b></div>
          <div class="kv"><span>Shoulder:hip ratio</span><b>${est.shoulderHipRatio}</b></div>
          <div class="kv"><span>Confidence</span><b>${est.confidence}</b></div>
          <p class="cite">${est.note}</p>
          ${est.waistProxyIn ? `<button class="btn secondary" id="apply-waist">Use ${est.waistProxyIn}" as my waist (editable)</button>` : ''}
        </div>`;
      const apply = $('#apply-waist');
      if (apply) apply.onclick = () => { state.profile.waist = est.waistProxyIn; persist(); toast('Applied to your profile — verify with a tape measure.'); };
    } catch (err) {
      out.innerHTML = `<div class="warn-box">${detectorError() || err.message}</div>`;
    }
  };
};

// ── View: LEADER ───────────────────────────────────────────────────────────
VIEWS.leader = function () {
  const members = state.unit.members;
  const ready = members.filter(m=>m.composite>=75).length;
  const rows = members.map((m,i)=>`<div class="member">
    <span>${m.name}</span>
    <span><span class="badge" style="background:${m.composite>=75?'var(--accent-2)':'var(--fail)'};color:#02132b">${m.composite}</span>
    <button class="btn secondary" data-del="${i}" style="padding:4px 8px">✕</button></span>
  </div>`).join('') || '<p class="hint">No members yet. This is a local demo of a unit-readiness roll-up for flight/squadron leaders.</p>';
  return `<div class="card">
    <h2>Leader View <span class="pill">unit readiness (local demo)</span></h2>
    <p class="hint">Aggregate readiness for the people you manage. In production this would sync from members' accounts with appropriate authorization — here it's a manual local demo.</p>
    <div class="score-hero" style="margin:10px 0">
      <div class="dial" style="--pct:${members.length?Math.round(ready/members.length*100):0};--dial-color:var(--accent-2)">
        <div class="num"><b>${ready}/${members.length||0}</b><span>ready</span></div>
      </div>
      <div class="hint">${members.length?`${Math.round(ready/members.length*100)}% of your unit is currently passing (composite ≥ 75).`:''}</div>
    </div>
    <div class="row"><input id="m-name" placeholder="Member name"><input id="m-score" type="number" min="0" max="100" placeholder="Composite"></div>
    <div style="margin-top:8px"><button class="btn" id="m-add">Add member</button></div>
    <div style="margin-top:14px">${rows}</div>
  </div>`;
};
WIRES.leader = function () {
  $('#m-add').onclick = () => {
    const name = $('#m-name').value.trim(); const score = clamp(+$('#m-score').value||0,0,100);
    if (!name) return toast('Enter a name.');
    state.unit.members.push({ name, composite: score }); persist(); render();
  };
  app.querySelectorAll('[data-del]').forEach((b)=>{ b.onclick=()=>{ state.unit.members.splice(+b.dataset.del,1); persist(); render(); }; });
};

// ── View: ABOUT / STANDARDS ─────────────────────────────────────────────────
VIEWS.about = function () {
  const active = getRuleset();
  const weights = Object.entries(STANDARD.weights).map(([k, v]) => `${cap(k)} ${v}`).join(' / ');
  const rsOpts = listRulesets().map((r) =>
    `<option value="${r.id}" ${r.id===getRulesetId()?'selected':''}>${r.label}</option>`).join('');
  const previewBanner = active.preview
    ? `<div class="warn-box" style="margin-bottom:14px">⚠ <b>Preview ruleset.</b> The PFRA-2026 point tables are provisional pending official publication, and the 20-point waist-to-height component is not yet scored here. Switch to the Legacy ruleset for scored assessments.</div>`
    : '';
  return `<div class="card">
    <h2>Standards & data provenance</h2>
    ${previewBanner}
    <label>Active ruleset</label>
    <select id="rs-select">${rsOpts}</select>
    <div style="margin-top:16px"></div>
    <div class="kv"><span>Authority</span><b>${STANDARD.authority}</b></div>
    <div class="kv"><span>Reference</span><b>${STANDARD.reference}</b></div>
    <div class="kv"><span>Ruleset version</span><b>${STANDARD.rulesetVersion}</b></div>
    <div class="kv"><span>Composite weighting</span><b>${weights}</b></div>
    <div class="kv"><span>Pass mark</span><b>≥ ${STANDARD.passComposite} composite + every component minimum</b></div>
    <div class="warn-box" style="margin-top:12px">${STANDARD.effectiveNote}</div>
    <h3 style="margin-top:16px">Bands</h3>
    <ul class="clean">${BANDS.map(b=>`<li><span class="badge" style="background:${b.color};color:#02132b">${b.label}</span> &nbsp; ${b.min}–${b.max===100?100:Math.floor(b.max)}</li>`).join('')}</ul>
    <p class="cite">1.5-mile run, push-up and sit-up tables carry official component minimums and maximum-point thresholds for all nine 5-year age brackets (both sexes); intermediate points are interpolated between official anchors. Events marked <span class="pill">est</span> are estimates pending verbatim transcription. Sources: USAF Fitness Assessment Scoring charts (Final Version), 2022.</p>
  </div>`;
};
WIRES.about = function () {
  $('#rs-select').onchange = (e) => {
    setRuleset(e.target.value);
    state.settings.ruleset = e.target.value;
    persist();
    normalizeDraftToRuleset();
    render();
    toast(`Switched to ${getRuleset().label}.`);
  };
};

// ── boot ─────────────────────────────────────────────────────────────────
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function clamp(n,lo,hi){ return Math.max(lo,Math.min(hi,n)); }
function VIEWS(){} function WIRES(){} // namespaces (hoisted below as objects)
syncTabs();
render();
