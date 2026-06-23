# PFAi — USAF Physical Fitness Assessment Coach (MVP)

A browser-based coach for U.S. Air Force fitness preparation. No build step, no
backend — all data stays on the user's device (localStorage). Pose model for the
experimental Body Scan loads from a CDN.

## Run it

```bash
cd pfai
npm start            # python3 -m http.server 8080
# or: npx serve -l 8080 .
```

Then open **http://localhost:8080**. Use `localhost` (not `file://`) so the
camera (`getUserMedia`) and ES modules work.

## What's implemented

| Tab | Status | Notes |
|-----|--------|-------|
| **Assess** | ✅ Real | Raw-performance input + exercise selection, correct 60/20/20 weighted composite, per-component pass/fail, body-composition screen, natural-language intake ("28M ran 1.5 in 12:40, 38 pushups…"), gap analysis (cheapest-points-first). |
| **What-If** | ✅ Real | Live sliders recompute composite + pass/fail instantly. |
| **Plan** | ✅ Real | Periodised week-by-week regimen weighted to highest-value gaps; respects goal date, days/week, equipment, injuries; folds in a weight-loss block when body comp flags it. Per-session logging. |
| **Progress** | ✅ Real | Composite + per-component trend sparklines, achievements/badges, workout count, JSON export, reset. |
| **Body Scan** | 🧪 Experimental | On-device TF.js MoveNet pose estimate of body *proportions* → rough waist proxy. **Not** a measurement or medical tool; honest disclaimers throughout; manual override required. |
| **Leader View** | 🟡 Demo | Local unit-readiness roll-up. Production needs accounts + authorization + sync. |
| **Standards** | ✅ Real | Shows the ruleset, weighting, bands, and data-provenance warning. |

## ⚠️ The single most important caveat

`js/data/standards.js` contains **approximate** scoring tables, not the official
charts. The scoring *engine* is correct; the *numbers* must be replaced with
verbatim values from the current **DAFMAN 36-2905** before any real airman relies
on this. The file is structured (anchor points + interpolation) so official
values drop in without touching the engine, and `STANDARD.rulesetVersion` should
be bumped when they do.

## Architecture

```
index.html          shell + tab nav + CDN pose-model scripts
styles.css          dark UI theme
js/
  data/standards.js scoring tables, bands, age brackets, body-comp tables  (DATA — swap for official)
  scoring.js        engine: raw→points, composite, pass/fail, gaps, what-if, body comp
  regimen.js        periodised plan generator (cheapest-points-first)
  parser.js         rule-based natural-language intake
  storage.js        localStorage persistence, trends, achievements, export
  camera.js         experimental pose-based proportion estimate
  app.js            state, routing, all seven views
```

## Not yet built (next steps)

- Real DAFMAN 36-2905 charts + altitude adjustment for run scoring
- Component medical-exemption handling in composite logic
- Multi-branch standards (Army ACFT, Navy PRT, Marine PFT/CFT) — engine is branch-agnostic
- Wearable import (Apple Health / Garmin)
- Real backend, accounts, and authorized leader-view sync
- Push-notification reminders (needs service worker + backend)
