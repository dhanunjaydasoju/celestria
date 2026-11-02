# CELESTRIA

**Explore Worlds Beyond Our Solar System.**

CELESTRIA is an interactive 3D explorer for the confirmed exoplanets in the [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/). Every value it shows carries its provenance (measured, calculated, estimated or unavailable). Missing data stays missing. Every 3D planet is labelled as an artistic impression.

It started as a 24-hour hackathon project. Project rules, the data model, ownership and the roadmap live in [CLAUDE.md](CLAUDE.md).

## What works today

| Area | Route | What it does |
|---|---|---|
| Home | `/` | NASA-textured Earth, lit by the Sun's real current position, with a Soyuz-inspired spacecraft on a 51.6° orbit. The orbit's size and speed are not to scale, and the page says so. The previous hero is kept at `/?scene=classic`. |
| System View | `/explore/:host?` | Any host star and its catalogue planets, with orbits computed from Kepler's equation. Click a planet to fly to it and see its info card. Pause and time-speed controls. Orbit distances are compressed and planet sizes enlarged, as labelled on screen. |
| Planet Viewport | `/viewport/:id?` | Full-screen procedural planet with a searchable picker over the whole catalogue. |
| Planet profile | `/planet/:id` | Every catalogue value with uncertainty, provenance badge and source citation. Also host-star, orbit and discovery panels, habitability indicators, and a footnote on how NASA's composite table combines papers. |
| Orbital Simulator | `/planet/:id/orbit` (menu: `/orbit`) | Star, planet and orbital path only. Time slider, step, play/pause, speed, reset. Live distance, speed (vis-viva) and phase. Real-date positioning when the timing uncertainty allows it. Assumptions such as a circular orbit when *e* is unknown are shown as banners. |
| Compare | `/compare?ids=…` | Up to four planets side by side, with Earth and the Sun as a separate reference column. A size comparison has true-scale and visibility modes. Planets are added from a catalogue search or a profile's "Add to compare" button, and Compare is in the menu. Values keep their uncertainty, limits and provenance. Highest or lowest values are marked only when they differ beyond their uncertainties. "Ask the Astronomer to compare these planets" opens the AI with the comparison as context. |
| Habitability | `/habitability` | Catalogue-wide flux × star temperature diagram with Kopparapu et al. (2014) zone bands, summary counts and a sortable table. Every planet links to its profile. |
| Ask the Astronomer | header button, any page | AI answers grounded in the catalogue (see below). It knows which planet or page you are on. |
| About | `/about` | NASA sync status and a "Check NASA for updates" button. |

### Procedural planets

- Exoplanets are rendered with GLSL shaders, with no textures.
- The archetype (rocky, sub-Neptune, Neptune-like, gas giant, unclassified) comes from radius or mass.
- The temperature band comes from equilibrium temperature or insolation.
- A planet's look is seeded from its name, so the same planet always looks the same.
- Each view states how many of its key measurements are available ("based on N of M").
- Earth on the homepage is the only body drawn with real imagery. The NASA public-domain textures and their credits are in [public/textures/earth/CREDITS.md](public/textures/earth/CREDITS.md).

## Architecture

```
Browser (React 19, React Router, Zustand,        Node server (Express 5, server/)
         three.js via React Three Fiber)          ─────────────────────────────────
  pages / components / three/                     /api/catalog (alias /api/planets), /api/planets/:id,
     │                                            /api/systems/:host, /api/stats, /api/health
     ├── src/services/api.js ── /api/* ──────►    /api/habitability
     │   (dev: Vite proxies to :8787)              /api/sync/status | check | refresh
     └── src/services/astronomerClient.js ───►    /api/ask (NDJSON progress stream), /api/ask/status
                                                   │
                                                   ├── NASA Exoplanet Archive TAP (pscomppars)
                                                   ├── committed seed + runtime catalogue on disk
                                                   └── Featherless API (key server-side only)
```

A backend is required for three reasons:

- The Featherless key must never reach the browser.
- NASA's TAP endpoint sends no CORS headers.
- Server-side caching with an on-disk catalogue keeps the app working offline or during a NASA outage.

In production one Express process serves both `dist/` and `/api` from the same origin.

## NASA data

- **Source.** NASA Exoplanet Archive, *Planetary Systems Composite Parameters* (`pscomppars`): one row per confirmed planet, 6,451 planets in the October 2026 catalogue. A row can combine values from different papers, and the profile says so.
- **Normalisation.** `src/pipeline/` turns raw columns into a Quantity model `{ value, err, status, source }`.
  - NASA's `CALCULATED_VALUE` reflinks become `calculated`.
  - Masses from the mass–radius relation become `estimated`.
  - M sin i is labelled as a minimum mass.
  - Atmospheric composition is not in the catalogue and is always shown as unavailable.
- **Storage.**
  - A committed seed snapshot (`server/data/catalog.snapshot.json.gz`) lets the app run offline.
  - Runtime syncs are written to `server/data/runtime/` (git-ignored): a current catalogue and a last-known-good backup.
  - At start-up the server serves the newest valid copy in the order current → backup → seed.
- **Sync.**
  - Every 24 hours, with backoff after failures.
  - A candidate catalogue replaces the served one only after raw-row and processed-record validation (canonical statuses only, ≥ 99 % of planets retained, coverage within 5 points) and an identical read-back from disk.
  - Anonymous `POST /api/sync/check` is cooldown-limited.
  - `POST /api/sync/refresh` needs an admin token held only on the server.
- **Imputation.** Grouped-median imputation exists only as a separate, labelled analysis layer (`/api/analysis/imputations`). It never feeds profiles, readouts, orbit physics, habitability or the AI.

## AI Astronomer

- `POST /api/ask` sends a question, plus optional planet context and history, to a Featherless-hosted model: `Qwen/Qwen3-32B`, falling back to `Qwen/Qwen3-14B` only after a retryable provider failure.
- The model works through eight read-only tools over the server's own catalogue: `search_planets`, `get_planet`, `get_system`, `compare_planets`, `compute_orbit`, `catalog_facts`, `assess_habitability`, `explain_concept`.
- The client never sends numbers.
- **Nothing the model writes is shown unless the validator (`server/ai/validate.js`) accepts it.** It checks:
  - numbers, units, uncertainties and provenance wording against tool results
  - minimum-mass and limit wording
  - habitable-zone claims (only via `assess_habitability`), and no claims of life
  - rankings, citations, links and dates
- Failed answers are repaired or retried. If they still fail, the user gets a fixed, honest reply built from tool results.
- Usage is limited:
  - per-client rate limits per minute and per day
  - a global daily question budget and USD spend cap, reserved per call
  - concurrency with a bounded queue
  - timeouts
- The drawer shows only progress stages the server has confirmed, with a real elapsed clock.

## Planet comparison

- **Comparison model.** `src/science/compare.js` is pure and tested. It groups values into planet basics, physical, orbital, host star, and discovery and system.
  - Each value keeps its uncertainty, limit, provenance, mass kind and source. Imputed values are never used.
- **Ranking.** A row is ranked only when every planet has a comparable value of the same kind.
  - Missing values, limits, assumed values and minimum masses (M sin i) block ranking, as do model estimates mixed with measurements.
  - A highest or lowest value is highlighted only when its uncertainty range clears every other planet's. An unknown uncertainty never counts as a clear difference.
- **Earth and Sun reference.** `src/science/earthReference.js` holds the values, with status `reference`, from:
  - NASA NSSDCA Earth and Sun fact sheets
  - IAU 2015 Resolution B3
  - Bouvier & Wadhwa 2010 (solar age)

  Reference values are never ranked against planets, never counted towards the four, and never sent to the AI.
- **Size view.** It draws only catalogue radii, on one shared scale.
  - NASA-calculated and model-based radii are styled differently from measured ones.
  - A planet with no radius, or only a limit, is shown as an outline with no size.
  - True scale shows the radius uncertainty as a faint ring. Visibility scale enlarges tiny bodies and labels them.
- **AI.** The AI astronomer has its own server-side `compare_planets` tool. The page only opens the astronomer with the compared planets as context.

## Habitability methodology

- The indicators are **qualitative and factor-by-factor**. There is no score or percentage, and no probability of life.
- **Placement.** Habitable-zone placement uses Kopparapu et al. (2014). The coefficients were checked against the authors' calculator, and the model is valid for stars of 2,600–7,200 K; evolved stars are excluded.
- **Uncertainty.** A planet whose flux or star temperature uncertainty straddles a zone edge is reported as straddling.
- **Indicators:**
  - stellar flux / zone placement
  - size (1.6 and 2.5 R⊕ thresholds)
  - mass (0.1–10 M⊕; M sin i and model masses flagged)
  - surface gravity and equilibrium temperature, as context only
  - host-star caveats
  - atmosphere, always unknown
- Only NASA values, or values calculated from them, are used. Imputed values never are.
- Every view states: "Habitable-zone placement is not evidence of habitability or life."
- Full method, thresholds and open questions: [docs/science/habitability.md](docs/science/habitability.md). Pending review by the team's science lead.

## Getting started

Requires Node 22 or newer (developed on Node 26).

```bash
npm install
cp .env.example .env      # then fill in values locally; .env is git-ignored
npm run dev               # web on http://localhost:5173, API on http://localhost:8787
```

Without a Featherless key the app works fully except Ask the Astronomer, which reports that it is not configured.

### Environment variables

All are read by the server only. Never prefix a secret with `VITE_`. See [.env.example](.env.example) for defaults and comments.

| Name | Purpose |
|---|---|
| `FEATHERLESS_API_KEY` | Featherless API key (secret) |
| `FEATHERLESS_MODEL`, `FEATHERLESS_FALLBACK_MODEL`, `FEATHERLESS_BASE_URL` | AI model selection and endpoint |
| `AI_RATE_LIMIT_PER_MINUTE`, `AI_RATE_LIMIT_PER_DAY`, `AI_DAILY_REQUEST_BUDGET`, `AI_DAILY_SPEND_LIMIT_USD`, `AI_COST_RESERVE_PER_CALL_USD`, `AI_MAX_CONCURRENCY`, `AI_MAX_QUEUE`, `AI_QUEUE_TIMEOUT_MS`, `AI_MAX_TOOL_ROUNDS`, `AI_MAX_TOOL_CALLS_PER_ROUND`, `AI_MAX_OUTPUT_TOKENS`, `AI_PROMPT_TOKEN_BUDGET`, `AI_MAX_INPUT_CHARS`, `AI_MAX_HISTORY_TURNS`, `AI_REQUEST_TIMEOUT_MS`, `AI_CALL_TIMEOUT_MS`, `AI_MAX_REPAIR_ATTEMPTS`, `AI_CACHE_TTL_SECONDS` | AI limits, budgets and timeouts |
| `API_PORT` | API port in development (default 8787) |
| `PORT` | Port in production (`npm start`), usually set by the host |
| `TRUST_PROXY` | Set behind a hosting proxy so per-client limits see the real client IP |
| `NASA_SYNC` | `off` disables the 24-hour NASA sync (`NASA_REFRESH` is the older name) |
| `NASA_DATA_DIR` | Folder for runtime catalogue files (default `server/data/runtime`) |
| `SYNC_ADMIN_TOKEN` | Admin token for `POST /api/sync/refresh` and `npm run data:sync` (secret, ≥ 24 characters) |
| `SYNC_URL` | Server URL used by `npm run data:sync` (default local API) |
| `VITE_USE_FIXTURES` | Frontend only, not secret: `true` runs the UI on local fixtures instead of the API |

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite and the API server together |
| `npm run dev:web` / `npm run dev:server` | One side only |
| `npm test` | All unit and integration tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run build && npm start` | Production build, served with the API by Express |
| `npm run data:snapshot` | Deliberately rebuild the committed seed snapshot from NASA |
| `npm run data:sync` | Ask a running server to sync now (needs `SYNC_ADMIN_TOKEN`) |

The 3D sandbox at `/lab` exists only in development builds.

## Testing

`npm test` runs Vitest over:

- **science:** orbital mechanics, habitable zone, habitability indicators, scale, Earth/orbit geometry
- **data:** normalisation against frozen raw NASA rows, imputation rules, sync validation
- **AI:** tools, validator, orchestrator with a scripted fake provider, limits
- **API routes:** including request-body errors
- **UI:** key components and pages, rendered on the server

The AI tests never call the real provider.

## Known limitations

- **Compare** has no metric charts. The size view compares radii only. Many rows are honestly left unranked, because NASA values often lack uncertainties or mix minimum masses, model estimates and measurements.
- **No dedicated catalogue search page.** Planets are found through the planet picker, System View and the habitability table. Filters such as discovery method or year range are not built.
- **Not built:** fun facts, spacecraft journey, soundscape, star map.
- **Production hardening is incomplete:**
  - no security headers (CSP and similar)
  - static assets are served without compression
  - the 3D bundle is large (~940 KB before gzip)
- The AI Astronomer needs a Featherless key and budget. Answers can be withheld when they fail validation, which is by design.
- NASA's composite table can mix values from different papers within one planet.
- Habitability indicators are pending review by the team's science lead.
- No public deployment yet.

## Contributing

1. `git switch main && git pull`
2. `git switch -c feat/<area>-<short-name>`  (area: `3d`, `ui`, `data`, `ai`)
3. Edit only files your workstream owns (see CLAUDE.md §4 and §11).
4. `npm run lint && npm test` before pushing.
5. Open a PR to `main` with the deliverable ID and how to test it. The lead reviews and squash-merges.
