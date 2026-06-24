# PFAi — USAF Physical Fitness Assessment Coach (MVP)

A browser-based coach for U.S. Air Force fitness preparation. No build step, no
backend — all data stays on the user's device (localStorage). Pose model for the
experimental Body Scan loads from a CDN.

## Run it

```bash
cd pfai
npm start            # node server.cjs — serves the app (+ AI proxy if configured)
# static-only alternative (no AI coach):
npm run static       # python3 -m http.server 8080
```

Then open **http://localhost:8080**. Use `localhost` (not `file://`) so the
camera (`getUserMedia`) and ES modules work.

### Optional: AI coach + LLM natural-language intake

The coach and LLM intake call **OpenRouter through a tiny local proxy** in
`server.cjs`, so the API key stays **server-side** and never ships to the
browser. To enable:

```bash
cp .env.example .env     # then add OPENROUTER_API_KEY (and optionally COACH_MODEL)
npm start
```

Without a key the app runs fully on-device — the Coach tab shows setup steps and
intake falls back to the rule-based parser. **Privacy:** using the coach sends
your entered numbers to the model; everything else stays local. The key is
git-ignored (`.env`); never commit it.

### Deploy (Vercel)

The same client talks to `/api/*`, served two ways:

- **Local:** `server.cjs` (via `npm start`) serves the static app **and** the proxy.
- **Deployed:** the `api/` directory ships as **Vercel serverless (edge) functions**
  (`api/coach.js` streams SSE, `api/parse.js`, `api/health.js`). Push to your
  Vercel-connected repo and they deploy automatically.

To enable the coach on the deployed site, set the key as a **Vercel environment
variable** (Project → Settings → Environment Variables):

```
OPENROUTER_API_KEY = sk-or-...        # required
COACH_MODEL        = anthropic/claude-sonnet-4.6   # optional
```

Then redeploy. Until that's set, the deployed Coach tab shows setup steps and the
rest of the app works fully on-device. The key lives only in Vercel's env (never
in the bundle or the repo).

## What's implemented

| Tab | Status | Notes |
|-----|--------|-------|
| **Assess** | ✅ Real | Raw-performance input + exercise selection, correct 60/20/20 weighted composite, per-component pass/fail, body-composition screen, natural-language intake ("28M ran 1.5 in 12:40, 38 pushups…"), gap analysis (cheapest-points-first). |
| **What-If** | ✅ Real | Live sliders recompute composite + pass/fail instantly. |
| **Plan** | ✅ Real | Periodised week-by-week regimen weighted to highest-value gaps; respects goal date, days/week, equipment, injuries; folds in a weight-loss block when body comp flags it. Per-session logging. |
| **Progress** | ✅ Real | Composite + per-component trend sparklines, achievements/badges, workout count, JSON export, reset. |
| **Body Scan** | 🧪 Experimental | On-device TF.js MoveNet pose estimate of body *proportions* → rough waist proxy. **Not** a measurement or medical tool; honest disclaimers throughout; manual override required. |
| **Leader View** | 🟡 Demo | Local unit-readiness roll-up. Production needs accounts + authorization + sync. |
| **Coach** | ✅ Real (AI) | LLM coach grounded in your computed scores + LLM natural-language intake, via a key-safe local proxy. Degrades gracefully with no key. |
| **Standards** | ✅ Real | Switchable ruleset (Legacy / PFRA-2026), weighting, bands, data provenance. |

Also: **installable PWA** that works offline (app shell cached; pose model stays
online by design), **printable scorecard** export, optional **altitude-adjusted
run** scoring, hash routing/deep links, and keyboard tab navigation.

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
- **PFRA 2026** — the new 100-point model, fully scored: **2-mile run 50 /
  waist-to-height 20 / strength (hand-release push-ups) 15 / core (plank) 15**
  (effective 1 Mar 2026). The waist-to-height curve is official; run / HRP /
  plank thresholds are **official at the under-25 and 60+ endpoints** and
  **age-interpolated** for the middle brackets (flagged `est` in the UI).

Sources: USAF Fitness Assessment Scoring charts (AFROTC/AFPC reproductions,
Final Version 2022) and published 2026 PFRA endpoints + waist-to-height curve —
male & female, all age brackets. `STANDARD.rulesetVersion`
is bumped whenever the embedded tables change so saved assessments stay
attributable to the ruleset they were scored under.

## Architecture

```
index.html          shell + tab nav + PWA links + CDN pose-model scripts
styles.css          dark UI theme
server.cjs          zero-dep Node server: static files + key-safe OpenRouter proxy
manifest.webmanifest, sw.js, icon.svg   PWA (installable, offline app shell)
.env.example        OPENROUTER_API_KEY / COACH_MODEL (copy to .env; gitignored)
js/
  data/standards.js official scoring tables, rulesets (legacy + 2026), WHtR, bands
  scoring.js        engine: ruleset-driven components, composite, pass/fail, gaps, what-if, WHtR
  regimen.js        periodised plan generator (cheapest-points-first)
  parser.js         rule-based natural-language intake (offline fallback)
  coach.js          AI coach + LLM-intake client (talks to the local proxy)
  storage.js        localStorage persistence, trends, achievements, export
  camera.js         experimental pose-based proportion estimate
  app.js            state, hash routing, all views
```

## Not yet built (next steps)

- Verbatim cell-exact transcription of the legacy alternate-event charts (HAMR,
  cross-leg crunch) and the full PFRA-2026 middle-bracket tables (currently
  endpoints are official + age-interpolated; altitude adjustment is an estimate)
- Component medical-exemption handling in composite logic
- Multi-branch standards (Army ACFT, Navy PRT, Marine PFT/CFT) — engine is branch-agnostic
- Wearable import (Apple Health / Garmin)
- Real backend, accounts, and authorized leader-view sync
- Push-notification reminders (needs service worker + backend)
