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

## Scoring data & fidelity

`js/data/standards.js` is now switchable between two rulesets (Standards tab):

- **Legacy PFA (60/20/20)** — the 1.5-mile run, 1-minute push-up and 1-minute
  sit-up tables carry the **official** component minimums and maximum-point
  thresholds for all nine 5-year age brackets, both sexes, transcribed from the
  published USAF Fitness Assessment Scoring charts ("Final Version", 2022).
  Intermediate point values are **interpolated** between official anchor points
  (run anchors follow the published low/moderate/high-risk breakpoints) and may
  differ from the printed chart by up to ~1–2 points; the pass minimums and
  max-point thresholds are exact. Alternate events (HAMR, hand-release push-ups,
  cross-leg reverse crunch, forearm plank) are flagged `official:false` —
  estimates pending verbatim transcription.
- **PFRA 2026 (preview)** — the new 100-point model (2-mile run 50 /
  waist-to-height 20 / strength 15 / core 15, effective 1 Mar 2026). Point
  tables are provisional pending official publication; the waist-to-height
  component is not yet scored. Use Legacy for scored results.

Sources: USAF Fitness Assessment Scoring charts (AFROTC/AFPC reproductions,
Final Version 2022) — male & female, all age brackets. `STANDARD.rulesetVersion`
is bumped whenever the embedded tables change so saved assessments stay
attributable to the ruleset they were scored under.

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

- Verbatim transcription of the alternate-event charts (HAMR, HRP, cross-leg
  crunch, plank) and the official PFRA-2026 point tables; altitude adjustment
- Component medical-exemption handling in composite logic
- Multi-branch standards (Army ACFT, Navy PRT, Marine PFT/CFT) — engine is branch-agnostic
- Wearable import (Apple Health / Garmin)
- Real backend, accounts, and authorized leader-view sync
- Push-notification reminders (needs service worker + backend)
