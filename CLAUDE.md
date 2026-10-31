# CELESTRIA — Explore Worlds Beyond Our Solar System

A premium, scientifically grounded, interactive 3D exoplanet exploration platform built in a 24-hour hackathon by a team of 3–4 beginners. It should feel like advanced observatory software, not a student dashboard.

**Name:** always "CELESTRIA" (product), tagline "Explore Worlds Beyond Our Solar System." Never use the old name "EXOVISTA" anywhere (code, UI, docs, package name, page title).

---

## 1. Non-negotiable rules

1. **Never fabricate data.** A missing NASA value is shown as unavailable. Never invent measurements, discoveries, or "facts".
2. **Every value carries provenance.** Each value is one of: `measured`, `calculated` (derived by NASA or by us from measured values with a stated formula), `estimated` (model-based, e.g. NASA's mass–radius relation), `imputed` (visual-only placeholder), or `missing`. The UI must make these visually distinct.
3. **Imputed values are visual-only.** They may drive a 3D look or a layout. They must never appear as a NASA measurement, in a data table, in AI prompts, or in habitability scoring.
4. **All 3D planets are artistic impressions.** Label them that way. Never imply that a render is a telescope image.
5. **No probability of life.** The habitability indicator is a transparent, factor-by-factor assessment. Being in a habitable zone does not make a planet habitable. The AI never claims a planet has life.
6. **Secrets stay server-side.** The Featherless API key lives only in `.env` on the server. Never import it into `src/`, never prefix it with `VITE_`.
7. **Display scale ≠ physical scale.** Whenever sizes or distances are exaggerated or compressed, say so on screen.
8. **Sounds are artistic sonifications**, not recordings. **Travel times are educational estimates**, not mission plans. **Simplified orbits are labelled as simplified.**

---

## 2. Tech stack (verified installed)

| Package | Installed | Use |
|---|---|---|
| react / react-dom | 19.3.1 | UI |
| vite | 8.3.5 | dev server / build |
| three | 0.187.0 | 3D engine |
| @react-three/fiber | 9.8.2 | React renderer for three |
| @react-three/drei | 10.7.9 | OrbitControls, Stars, Html, Line, etc. |
| motion | 14.9.0 | UI animation (`import { motion } from 'motion/react'`) |
| lucide-react | 1.65.0 | icons |
| Node | 26.x | runtime (built-in `fetch`, `--env-file`, `--watch`) |

**Approved additions (add only these unless the lead agrees):**

| Package | Why |
|---|---|
| `react-router` | multiple real pages (profile, compare, orbit simulator) with shareable URLs |
| `zustand` | small global store (selection, compare list, settings); already a transitive dep of R3F — add it explicitly |
| `express` | tiny server for the NASA proxy/cache and the Featherless proxy |
| `concurrently` (dev) | run `vite` + server with one `npm run dev` |
| `vitest` (dev) | unit tests for science code (orbits, habitability, unit conversions) |

Optional, only if time allows: `@react-three/postprocessing` (bloom on stars). **Do not add:** chart libraries (hand-build SVG charts), Tone.js (use Web Audio directly), UI kits, CSS frameworks, axios, dotenv.

---

## 3. Architecture

```
Browser (React + R3F)                      Node server (Express, server/)
─────────────────────                      ──────────────────────────────
pages / components                         GET  /api/planets        → full normalized catalog (cached)
   │                                       GET  /api/planets/:id    → one planet (+ its system siblings)
   ├─ src/services/api.js  ── /api/* ──►   POST /api/astronomer     → Featherless call, grounded prompt
   │  (dev: Vite proxy to :8787)           GET  /api/health
   └─ store (zustand)                          │
                                               ├─ NASA TAP (pscomppars)  — no key, no CORS
                                               ├─ server/data/planets.snapshot.json (committed fallback)
                                               └─ Featherless API (key in .env)
```

- **Why a backend is required:** (a) Featherless key must not reach the browser; (b) the NASA Archive TAP endpoint sends **no CORS headers** (verified), so the browser cannot call it directly; (c) server-side caching + a committed snapshot protects the demo against slow venue Wi-Fi or a NASA outage.
- **Dev:** `npm run dev` runs Vite (5173) and the server (8787). `vite.config.js` proxies `/api` → `http://localhost:8787`.
- **Prod:** one Node service (e.g. Render/Railway/Fly) runs `npm run build` and serves `dist/` + `/api` from the same Express app. Same origin, no CORS config needed.

### Which features need the backend

| Feature | Backend? | Why |
|---|---|---|
| NASA data (F2) and everything built on it | Yes | CORS, caching, snapshot fallback |
| AI astronomer (F5 summary, F6B) | Yes | secret key, grounded prompt built server-side, response cache, rate limit |
| 3D viewer, size compare, orbit simulator, travel, soundscape, fun facts, habitability score | No | pure client computation on data already loaded |

---

## 4. Folder structure

Each folder has exactly one owner. Owner tags: **[LEAD]** Team Lead + 3D Lead, **[UI]** Teammate 2, **[DATA]** Teammate 3, **[AI]** Teammate 4. Only the owner edits a folder; everyone else opens an issue or asks in chat (see §11).

```
celestria/
├─ CLAUDE.md                    [LEAD]
├─ package.json, package-lock   [LEAD]  dependency changes go through the lead
├─ vite.config.js, index.html   [LEAD]  /api proxy, title "CELESTRIA — Explore Worlds Beyond Our Solar System"
├─ .env.example                 [DATA]  FEATHERLESS_API_KEY=, FEATHERLESS_MODEL=, API_PORT=8787
├─ server/
│  ├─ index.js                  [DATA]  express app, static dist in prod
│  ├─ routes/planets.js         [DATA]
│  ├─ nasa/query.js             [DATA]  TAP query string + column list
│  ├─ nasa/normalize.js         [DATA]  raw row → Planet model (provenance!)
│  ├─ nasa/cache.js             [DATA]  memory cache + disk snapshot, TTL 24h
│  ├─ scripts/fetch-snapshot.js [DATA]  `npm run data:snapshot`
│  ├─ data/planets.snapshot.json[DATA]
│  ├─ routes/astronomer.js      [AI]
│  ├─ ai/featherless.js         [AI]    OpenAI-compatible client
│  └─ ai/prompts.js             [AI]    system + task prompts
├─ scripts/build-lab-fixtures.js [LEAD] real NASA rows → src/three/lab/fixtures.json (lab only)
├─ public/models/               [LEAD]  optional GLBs (spacecraft), Draco-compressed
└─ src/
   ├─ main.jsx, App.jsx         [LEAD]  router + providers (integration point)
   ├─ contracts/                [LEAD]  JSDoc typedefs + prop docs for every shared interface (§11.2)
   ├─ styles/                   [UI]    tokens.css, base.css, typography
   ├─ layout/                   [UI]    AppShell, NavBar, Footer, PageHeader
   ├─ pages/
   │  ├─ LandingPage.jsx        [UI]    hero embeds <HeroScene/> from LEAD
   │  ├─ CatalogPage.jsx        [UI]    search / filter / sort
   │  ├─ PlanetPage.jsx         [UI]    profile; embeds LEAD viewports + AI panels
   │  ├─ ComparePage.jsx        [UI]    table + charts; embeds <SizeCompareViewport/>
   │  ├─ ExplorePage.jsx        [LEAD]  main 3D system viewer + star map (uses UI primitives)
   │  └─ OrbitPage.jsx          [LEAD]  dedicated orbital simulator (/planet/:id/orbit)
   ├─ components/
   │  ├─ ui/                    [UI]    Button, Panel, Tabs, Slider, Badge, Tooltip, Sheet
   │  ├─ data/                  [UI]    Measurement, ProvenanceBadge, MissingValue, StatGrid
   │  ├─ charts/                [UI]    LogBarChart, RangeBar (plain SVG)
   │  ├─ habitability/          [UI]    HabitabilityPanel, FactorRow (renders AI's assessment output)
   │  ├─ facts/                 [UI]    FunFactList (renders AI's funFacts output)
   │  └─ ai/                    [AI]    AstronomerPanel, AiAnswer (built from UI primitives)
   ├─ three/                    [LEAD]
   │  ├─ viewports/             public 3D components other pages embed (§11.2)
   │  ├─ planet/                ProceduralPlanet.jsx, materials/, shaders/, archetype.js, visualParams.js
   │  ├─ star/                  Star.jsx, starColor.js
   │  ├─ scenes/                SystemScene, StarMapScene, SizeCompareScene, OrbitScene, JourneyScene, HeroScene
   │  ├─ shared/                Starfield, OrbitPath, CameraRig, Spacecraft, Lighting
   │  ├─ hooks/                 useOrbitClock, useCameraFocus
   │  ├─ lab/                   dev-only /lab sandbox (/lab/planet?id=…, /lab/gallery) + lab fixtures
   │  └─ scale.js               display-scale functions (documented)
   ├─ science/
   │  ├─ constants.js           [DATA]  G, AU, R_earth, R_sun, pc→ly, …
   │  ├─ units.js               [DATA]
   │  ├─ derived.js             [DATA]  gravity, density, a from Kepler III
   │  ├─ catalogStats.js        [DATA]  medians + percentiles (for imputation & fun facts)
   │  ├─ kepler.js              [LEAD]  orbital mechanics
   │  ├─ travel.js              [LEAD]  journey estimates
   │  ├─ habitability.js        [AI]    factor assessment (research-backed)
   │  ├─ habitableZone.js       [AI]    Kopparapu et al. 2013/2014 boundaries
   │  └─ funFacts.js            [AI]    rule-based facts from data + catalog percentiles
   ├─ audio/soundscape.js       [AI]    stretch (P2) — Web Audio graph
   ├─ services/api.js           [DATA]  fetch wrapper, retries, in-memory cache
   ├─ store/useCelestria.js     [LEAD]  zustand store (slices documented in §11.2)
   └─ data/fixtures/            [DATA]  3–5 planets in final model shape for offline work
```

---

## 5. Data: NASA Exoplanet Archive

- **Endpoint:** `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=<ADQL>&format=json` (no API key).
- **Table:** `pscomppars` — Planetary Systems Composite Parameters, **one row per confirmed planet** (6,451 rows as of 2026-10-30). Ideal for a browsable catalog. Note: a row may combine values from different papers, so values in one row are not always self-consistent. Say so in the profile footnote and link the archive.
- **Fetch once on the server** with a single ADQL `select <columns> from pscomppars`, normalize, cache in memory, write the snapshot to disk. Refresh at most every 24 h. If NASA fails, serve the snapshot. Keep a committed snapshot so the app runs offline.
- **Client:** `GET /api/planets` once per session (≈6.5k rows × ~40 compact fields, gzip ~0.5 MB). Hold it in the store. Search, filter, and sort run client-side in memory with `useMemo` and a debounced input. Set `Cache-Control: max-age=3600` and an ETag.

**Columns to request** (plus `*err1`, `*err2`, `*lim` where noted):

| Group | Columns |
|---|---|
| Identity | `pl_name`, `hostname`, `sy_snum`, `sy_pnum`, `pl_controv_flag` |
| Discovery | `discoverymethod`, `disc_year`, `disc_facility`, `disc_telescope` |
| Orbit | `pl_orbper`(±), `pl_orbsmax`(±), `pl_orbeccen`(±), `pl_orbincl`, `pl_orblper`, `pl_orbtper`, `pl_tranmid`, `ttv_flag` |
| Planet | `pl_rade`(±), `pl_rade_reflink`, `pl_radj`, `pl_bmasse`(±), `pl_bmasse_reflink`, `pl_bmassj`, `pl_bmassprov`, `pl_dens`, `pl_eqt`(±), `pl_eqt_reflink`, `pl_insol`(±) |
| Star | `st_spectype`, `st_teff`(±), `st_rad`, `st_mass`, `st_lum` (log10 L☉), `st_met`, `st_logg`, `st_age` |
| System | `sy_dist`(±) (parsecs), `ra`, `dec`, `sy_vmag` |

**Provenance mapping (verified on live data):**
- `*_reflink` containing `CALCULATED_VALUE` means NASA calculated the value, not a direct measurement → `calculated`. About 1,539 radii are calculated.
- `pl_bmassprov`: `Mass` → `measured`. `Msini` → `measured` but a **minimum mass**, so label it "M sin i (minimum)". `M-R relationship` → `estimated`. About 3,035 masses are estimated, nearly half the catalog. Never present an estimated mass as measured.
- Strip HTML from reflinks and keep the citation text + URL for a "Source" tooltip.
- Atmospheric composition is **not** in this table. Show "No atmospheric data in catalog" rather than guessing.

**Normalized Planet model** (the team contract; freeze this in hour 1):

```js
{
  id: "trappist-1-e",            // slug of pl_name
  name: "TRAPPIST-1 e", host: "TRAPPIST-1",
  radiusEarth:   { value: 0.92, err: [+0.013, -0.013], status: "measured", source: {...} },
  massEarth:     { value: 0.69, status: "measured", kind: "Mass" | "Msini" | "M-R" },
  // … every numeric field is a Quantity { value|null, err?, status, source? }
  star: { name, teff: Quantity, radiusSun: Quantity, massSun: Quantity, lumLog: Quantity, spectralType },
  discovery: { year, method, facility },
  system: { distancePc: Quantity, planetCount, starCount, ra, dec },
  flags: { controversial: bool, ttv: bool }
}
```

`status: "missing"` means `value: null`. Components read only this model, never raw NASA columns.

---

### M4 data pipeline (implemented)
- `src/pipeline/` (pure, shared by server and tests): `nasaColumns.js` (column map), `normalize.js` (row → Planet), `entities.js`, `imputation.js` (§5a). `__fixtures__/raw-41.json` freezes the raw rows of the 41 regression planets; `normalize.test.js` proves they reproduce the lab fixtures.
- `server/nasa/`: `http.js` (timeouts, exponential backoff), `ingest.js` (RA-chunked TAP fetch ≤ 600 rows/chunk, per-chunk and total count checks, `validateCatalog`), `snapshot.js` (compact gzipped snapshot, atomic write), `refresh.js`, `catalogStore.js`.
- API: `/api/health`, `/api/catalog` (alias `/api/planets`; index without per-value sources/uncertainties), `/api/planets/:id` (full record), `/api/systems/:host`, `/api/stats`, `/api/analysis/imputations`. Gzip via `node:zlib`, hashed ETags; no compression dependency.
- Client: `services/api.js` (live), store `loadDetail(id)` for full records; lists are search-first above 300 items.

## 5a. Missing data and median imputation policy (M4)

NASA rows are often incomplete. CELESTRIA may fill gaps with **grouped medians for analysis only**, under these rules. They override convenience everywhere.

**Separation (non-negotiable)**
1. The canonical dataset is NASA's: a missing value stays `{ value: null, status: 'missing' }` in the snapshot, the API's planet records, the store and every UI readout. Imputation never writes into a Quantity.
2. Imputed values live in a separate layer produced by `src/pipeline/imputation.js` (`imputations[planetId][field]`), each carrying `method: 'median'`, `label: 'Estimated — Median Imputed'`, `group`, `groupLevel`, `groupSize`, `iqr`, `catalogVersion`.
3. Consumers must opt in. Allowed: similarity/clustering/ML features, catalog-wide charts with an imputation toggle, 3D visual stand-ins. **Forbidden:** planet profiles and Key Features, System View cards, scientific readouts, Orbital Simulator physics (`kepler.js`), habitability scoring, AI astronomer prompts and answers, fun facts. `scienceValue()` / `isScientific()` reject imputed values, and badges show them as Unavailable unless a component explicitly passes `allowImputed`.
4. Label: **"Estimated — Median Imputed"**, visually distinct from Estimated.

**Physics before medians.** If a gap can be computed from measured values it is `calculated` with a stated basis, never imputed: Teq from Teff, R★ and a, else from insolation (Teq = 278.6 K·S^¼); insolation from L★ and a, else from Teq; a from Kepler III; density from M and R.

**Which fields**

| Imputable (analysis only) | Grouped by (fallback order; ≥ 20 values per group) |
|---|---|
| radiusEarth | mass bin → discovery method → global |
| massEarth | radius bin (≤1.6, 1.6–4, 4–8, >8 R⊕) → discovery method → global |
| densityGcc | size class (from known R, else known M) → global |
| eccentricity | period bin (<10 d, 10–100 d, >100 d) → global |
| eqTempK, insolationEarth (only if physics can't) | period bin × spectral class → period bin → global |
| star teff, radiusSun, metallicity, ageGyr | spectral class letter → star mass bin → global |
| star massSun | spectral class letter → star Teff bin → global |

**Never imputed:** identifiers and names, host, discovery year/method/facility/telescope, spectral type and other categories, flags, orbital period, semi-major axis (Kepler III or unavailable), inclination, argument and time of periastron, transit midpoint, uncertainties and limits, sources, coordinates, distance, magnitudes, M sin i (not missing: a lower limit), atmosphere.

**Medians use only valid source values:** measured or NASA-calculated; never missing, limits (`<`/`>`), eccentricity fixed at 0, model-based estimates (e.g. NASA's mass–radius masses) or other imputed values (no chaining).

**Selection bias.** Catalog medians inherit discovery bias (transit surveys favour short periods and large radii; RV favours massive planets; imaged planets are young giants with model masses). Grouping by a covariate the planet actually has reduces this but does not remove it; every imputation records its group, fallback level, group size and IQR so analyses can weight or exclude it. Groups are never formed from the field being imputed. Measured on the Oct 2026 catalogue: before adding the star-mass fallback, ~89% of imputed stellar temperatures fell back to the global median (Kepler hosts often lack a spectral type), which would misplace M dwarfs by ~2000 K; stellar mass (present for 99.9% of hosts) now precedes global.

**Tests** (`src/pipeline/imputation.test.js`) must keep proving: canonical data is unchanged and missing stays missing; imputed entries are labelled and traceable; forbidden fields are never imputed; medians use only valid inputs; fallback is recorded; physics wins; science functions ignore imputed values.

---

### M5 AI astronomer backend (implemented, Phase 2)
- `POST /api/ask { question, planetId?, history? }` → `AskResponse` (`src/contracts/api.js`); supersedes `/api/astronomer`. `GET /api/ask/status`.
- `server/ai/`: `config.js` (limits, key in a closure), `featherless.js` (client, typed retryable errors incl. HTTP 200 error bodies), `limits.js` (per-client minute/day, global daily questions and USD spend with per-call reservation, concurrency + bounded queue; synchronous check-and-reserve), `orchestrator.js` (pre-retrieval → tool loop → validate → repair → safe reply), `prompts.js`, `validate.js`, `tools/` (7 read-only tools), `knowledge/concepts.js`.
- Primary `Qwen/Qwen3-32B` with `/no_think`; `Qwen/Qwen3-14B` only after a retryable provider failure, validated identically.
- Nothing the model writes is shown unless `validate.js` accepts it; clarification / not-found / insufficient-data / unverified replies are fixed text built from tool results.

## 6. Feature specs (condensed)

Priority: **P0** = must ship for the demo, **P1** = expected, **P2** = only if time allows.

### F1 Interactive 3D viewer (P0) — `ExplorePage`
- `SystemScene`: host star + all catalog planets of that host. Planets rotate and follow animated orbits. Click a planet to select it (info card). Pause/resume. Drei `OrbitControls` with damping. `CameraRig` lerps to the target for smooth transitions. Drei `<Stars>` or a custom `Starfield` (one `Points`).
- System navigation: search box + prev/next "notable systems" list + (stretch) **Star map**: all ~4.5k host stars as **one `THREE.Points`** positioned from `ra`, `dec`, `sy_dist`. Raycast to pick a star and fly into its system. One draw call keeps it fast.
- Scale: orbit radius uses a compressed scale (`log` of `a`), planet size uses an exaggerated scale (`scale.js`). Show a persistent "Not to scale" chip.

### Procedural planet renderer — `three/planet/`
- **Archetype** (`archetype.js`) from available data only:
  - radius < 1.6 R⊕ → *rocky*; 1.6–4 → *sub-Neptune*; 4–8 → *Neptune-like*; > 8 → *gas giant*
  - If radius is missing, use mass (< 2 M⊕ rocky, < 10 sub-Neptune, < 50 Neptune-like, else giant).
  - Temperature band from `pl_eqt` (or from insolation if `pl_eqt` is missing): *scorching* > 1000 K (emissive cracks / glow), *hot* 500–1000 K, *temperate* 200–350 K, *cold* < 200 K (icy palette).
  - Nothing usable → *unclassified*: neutral grey-blue, matte, with an "insufficient data" tag.
- **One shared `SphereGeometry`** per detail level (64 segments for the hero planet, 24 in system view). **One `ShaderMaterial` per archetype**, driven by uniforms: 3D simplex fbm noise for rocky surfaces, latitude bands + turbulence for giants, a fresnel atmosphere shell for planets above about 1.6 R⊕. Colours come from palettes per archetype × temperature band.
- **Deterministic seed** = hash(`pl_name`). The same planet always looks the same.
- No texture downloads (all procedural) → instant load and no asset pipeline. Optional Blender GLB only for the spacecraft (`useGLTF`, lazy, Draco).
- Star colour from `st_teff` via a blackbody→sRGB approximation. Star size from `st_rad`, using the neutral solar default *visually only* if missing (imputed, labelled).
- Every planet view shows the badge "Artistic impression based on [N of M] available measurements."

### F2 NASA integration (P0): see §5.

### F3 Search & profiles (P0) — `CatalogPage`, `PlanetPage`
- Search by planet or host name. Filters: discovery method, year range, radius class, "has mass measurement", "in habitable zone", max distance. Sort by any numeric column with missing values last. Virtualize or paginate the list (render ≤ 100 rows at a time).
- Profile: hero 3D planet, stat grid using `<Measurement>` (value, ± error, unit, provenance badge, source tooltip, "Unavailable" state), host-star panel, discovery panel, plus tabs for Habitability, AI Astronomer, Fun Facts, Soundscape, Journey, and a prominent **"Open Orbital Simulator"** button.

### F4 Size comparison (P1) — inside `ComparePage`
- `SizeCompareScene`: selected planets + Earth (+ optional Sun, 109.2 R⊕) side by side on a baseline.
- Two modes: **True scale** (linear radius) and **Visibility scale** (minimum displayed size, so tiny planets stay visible). The active mode is always labelled. Each body shows its real radius label.
- A planet with no radius is shown as a dashed outline sphere labelled "Radius unavailable", never a guessed size.

### F5 Comparison engine (P1) — `ComparePage`
- Up to 4 planets plus Earth as a reference column. Rows: radius, mass (+ kind), density, eq. temp, insolation, period, a, e, distance, star teff/mass/radius, discovery.
- Highlight the min and max per row. Show "× Earth" ratios. Missing cells get a clear "—  not measured" marker, not 0.
- SVG log-scale bar charts per metric (values span 4+ orders of magnitude).
- "Summarize with AI astronomer" button → `/api/astronomer` with `mode: "compare"` and the planet ids.

### F6A Habitability indicator (P0) — `science/habitability.js`
Output is **a list of factors plus a qualitative tier**, not a percentage.

| Factor | Inputs | Rule (assessment) |
|---|---|---|
| Stellar flux / HZ | `pl_insol`, `st_teff` | Kopparapu conservative HZ (runaway → max greenhouse) and optimistic HZ (recent Venus → early Mars) → inside conservative / inside optimistic / outside |
| Size | `pl_rade` | ≤ 1.6 R⊕ likely rocky; 1.6–2.5 uncertain; > 2.5 likely volatile-rich / no solid surface |
| Mass | `pl_bmasse` (+ kind) | 0.1–10 M⊕ compatible; M-R estimates flagged "estimated"; Msini noted as a lower limit |
| Surface gravity | M / R² (Earth units) | only if both are present; marked `calculated` (or `estimated` if mass is M-R) |
| Equilibrium temperature | `pl_eqt` | context only. It assumes an albedo and no greenhouse effect, and the UI says so |
| Host star | `st_teff`, `st_spectype` | M dwarf → flare activity / likely tidal locking caveats; very hot stars → short lifetimes |
| Atmosphere | — | always "Unknown — not in catalog" |

Each factor: `favorable | uncertain | unfavorable | unknown`, the inputs with provenance, and a one-line explanation. Tier examples: "Potentially temperate rocky world", "Temperate but likely gaseous", "Too hot for surface liquid water", "Insufficient data". Always show the note "Habitable-zone placement is not evidence of habitability or life." Imputed values are never inputs.

### F6B AI astronomer (P0 for the profile, P1 for compare) — `server/routes/astronomer.js`
- The client sends `{ mode: "survivability" | "compare" | "ask", planetIds, question? }`. The **server looks up the planets in its own cache** and builds the data block. The client never sends numbers, so the AI is grounded only in real data.
- The data block lists each field with value, unit, and status. Missing fields are listed explicitly as UNKNOWN. Imputed values are excluded.
- System prompt rules: use only the provided data; tag every claim as **[Observed] / [Estimated] / [Unknown] / [Speculation]**; never claim life; habitable zone ≠ habitable; say "unknown" rather than guess; concise.
- Survivability response is structured JSON-ish sections → rendered as cards: *Could humans survive?*, *Major risks*, *Conditions that might support life*, *Why it's interesting*, *What we don't know*, *Compared to Earth*.
- Featherless is OpenAI-compatible: `POST https://api.featherless.ai/v1/chat/completions`, `Authorization: Bearer $FEATHERLESS_API_KEY`, model from `FEATHERLESS_MODEL` (pick a strong instruct model from their catalog; verify that it is available on the team's plan). `temperature ≈ 0.3`.
- Cache responses in memory by `mode + ids + question`. Use a 30 s timeout, a friendly error state, and a simple per-IP rate limit. Stream with SSE only if time allows (P2).
- Prefill the cache for 5–6 demo planets before the demo.

### F7 Spacecraft journey (P2) — `JourneyScene` (`<JourneyViewport>`) on the profile "Journey" tab
- Animated craft (procedural primitives or a small GLB) along a curved path from the Sun to the destination system. Distance in pc, ly, and km.
- Travel time = distance / speed (`science/travel.js`) for selectable reference speeds: Voyager 1 (~17 km/s), Parker Solar Probe peak (~190 km/s), 10% c (hypothetical), light speed.
- Assumptions shown: constant speed, no acceleration phase, no relativity, ignores stellar motion. Not a real trajectory. Missing `sy_dist` → the journey is disabled with an explanation.

### F8 Fun facts (P1) — `science/funFacts.js`
- **Rule-based templates over real data and catalog percentiles**, no AI: "A year here lasts 1.5 Earth days", "Hotter than molten lava (~1,200 K)", "Discovered in 2017 by TRAPPIST via Transit", "Shortest orbit among the top 1% of known planets", "Its star is 12% the mass of the Sun", "Light from this system left when …". Each fact cites the field it uses and its status. Skip a template if any of its inputs is missing.

### F9 Missing-data system (P0, cross-cutting)
- Provenance lives in the Quantity model (§5). `<Measurement>` renders all five statuses distinctly: measured = solid, calculated = "calc" badge, estimated = "est." badge and muted, imputed = never shown as a value, missing = "Unavailable" in a muted dashed style.
- `three/` reads `visualParams(planet)`. That function may substitute visual stand-ins (status `imputed`) to choose a look; they are surfaced in the "N of M measurements" badge. Catalog median imputation follows §5a.
- Renderer and orbit sim must not crash on any combination of nulls. Unit tests cover all-null planets.

### F10 Soundscape (P2) — `src/audio/soundscape.js`
- Pure Web Audio API: oscillator drone + filtered noise + LFO. Mappings: orbital period → drone pitch (log scale), eq. temperature → filter brightness, radius → noise "atmosphere" density, star teff → timbre, and an orbit "pulse" once per scaled period. Missing inputs → neutral defaults.
- Start only on a user gesture. Smooth fade in and out. Disconnect nodes on unmount. Label: "Artistic sonification — not a recording."

### F11 Discovery timeline: **ON HOLD. Do not build.**

### F12 Orbital Simulator (P0) — standalone `OrbitPage` at `/planet/:id/orbit`
- Reached only from the profile button. The scene contains **only** the host star, the planet, and its orbital path. No other planets, starfield kept subtle.
- Controls: time slider (0 → one period, wraps), step back/forward, play/pause, speed (×1 h/s … ×1 period/10 s), reset, elapsed time, phase %.
- Info panel: period, current speed, current distance, e, a, periastron `a(1−e)`, apoastron `a(1+e)`, phase. Show a value only if it is available or calculable, with provenance.
- **The slider sets simulation time `t`. Position is computed from `t` by Kepler's equation** (see §7), not by an animation tween.

---

## 7. Orbital mechanics — `src/science/kepler.js`

Pure functions, unit tested.

1. **Inputs:** P (`pl_orbper`, days), a (`pl_orbsmax`, AU), e (`pl_orbeccen`), i (`pl_orbincl`), ω (`pl_orblper`), T_p (`pl_orbtper`), T_c (`pl_tranmid`), M★ (`st_mass`).
2. **Fill-in rules (all labelled):**
   - a missing but P and M★ present → Kepler III: `a³ = G(M★)P²/4π²` (planet mass negligible) → `calculated`.
   - e missing → assume `e = 0` → banner: "Eccentricity unknown — circular orbit assumed (simplified)".
   - ω missing → 90° (orientation arbitrary, labelled).
   - Phase anchor: use T_p if present. Else, if T_c and ω are present, the transit happens at true anomaly `ν_t = 90° − ω` → convert to mean anomaly → derive T_p. Else phase 0 is arbitrary → "Orbital phase not anchored to real time." (Note: ω conventions differ between papers; treat transit anchoring as approximate.)
   - No P → the simulator is unavailable (explain why). No a and no M★ → normalized orbit with a relative distance only; no absolute speed or distance shown.
3. **Per frame:** mean anomaly `M = 2π(t − T_p)/P` → solve `E − e·sinE = M` (Newton–Raphson, start `E = M` (or π if e > 0.8), ≤ 10 iterations, tol 1e-10) → true anomaly `ν = 2·atan2(√(1+e)·sin(E/2), √(1−e)·cos(E/2))` → `r = a(1 − e·cosE)`.
4. **Speed:** vis-viva `v = √(GM★(2/r − 1/a))` (km/s) → varies along an elliptical orbit, fastest at periastron.
5. **Position in the orbital plane:** `(r cosν, r sinν)` → rotate by ω, then tilt by i for the 3D view (the viewer camera is free, so inclination is mainly informational).
6. Orbit path line = 256 samples of ν. Time `t` is held in a `useRef` and advanced in `useFrame` while playing (no React re-render per frame). The UI readouts update at about 10 Hz.

The system viewer (F1) uses the same `kepler.js` for its planets, with time compression.

---

## 8. Design system

- **Mood:** dark observatory instrument. Deep near-black blue background (`#05070c`-ish), off-white text, **one** restrained accent (pale cyan or warm amber for selection/active states), plus semantic provenance colours (measured / calculated / estimated / missing). No purple gradients, no glow-everything, minimal glassmorphism (at most one subtle translucent panel style for overlays on 3D).
- **Type:** a refined display face for headings, a clean sans for UI, a **monospace with tabular figures for every number**. Decide in hour 1. Self-host or Google Fonts with `display=swap`.
- **Layout:** the 3D canvas is the hero. Information panels are thin-bordered, squared or slightly rounded (≤ 6 px), anchored to edges, with consistent 4/8 px spacing. Use hierarchy through type size and weight, not boxes inside boxes.
- **Motion:** short (150–300 ms) easing on panels. Camera moves use eased lerp. Respect `prefers-reduced-motion`.
- Tokens live in `src/styles/tokens.css` as CSS custom properties. Components use tokens only; no ad-hoc hex values.
- **Responsive:** desktop first; on mobile, panels become bottom sheets and the canvas stays usable.

---

## 9. Performance & reliability

- One `<Canvas>` per page. `dpr={[1, 1.75]}`. `frameloop="demand"` where nothing animates (size compare).
- Never render more than about 12 detailed planets at once. Star map = one `Points` object. Share geometries. Memoize materials. Dispose on unmount (R3F handles owned objects; dispose manually created textures/geometries).
- Lazy-load pages with `React.lazy` (three-heavy pages split from the catalog).
- Scene components wrapped in `<Suspense>` + error boundary with a 2D fallback card.
- Animation state in refs + `useFrame`, not React state.
- `services/api.js`: in-memory cache, one in-flight request per key, 1 retry, typed error states shown in the UI.
- Test on an integrated-GPU laptop. Target 50+ fps in the system view.

---

## 10. Commands

```bash
npm run dev            # vite + server (concurrently)
npm run dev:web        # vite only
npm run dev:server     # node --watch --env-file=.env server/index.js
npm run data:snapshot  # refresh server/data/catalog.snapshot.json.gz from NASA (chunked, validated;
                       # leaves the existing snapshot untouched on any failure)
npm run test           # vitest (science/)
npm run lint
npm run build && npm start   # production: express serves dist + /api on $PORT
NASA_REFRESH=on|off    # background refresh of a >24 h-old snapshot (default: on in production, off in dev)
VITE_USE_FIXTURES=true # run the frontend on local fixtures instead of the API
```

---

## 11. Team, ownership & contracts

### 11.1 Roles and deliverables

| Who | Owns | Delivers (in order) |
|---|---|---|
| **Team Lead + 3D Lead** [LEAD] (primary developer and integration lead; uses Claude Code) | `src/three/**`, `ExplorePage`, `OrbitPage`, `science/kepler.js`, `science/travel.js`, `src/contracts/`, `App.jsx`/router, store, `package.json`, `vite.config.js` | Contracts (§11.2) → procedural renderer → system viewer → orbital simulator → size compare → star map → journey → integration of all workstreams. Reviews and merges every PR. |
| **Teammate 2 — UI/UX + Frontend** [UI] | `styles/`, `layout/`, `components/ui|data|charts|habitability|facts`, Landing/Catalog/Planet/Compare pages | **D2.1** tokens + type + UI primitives (h3) · **D2.2** AppShell/NavBar + Landing (h5) · **D2.3** Catalog search/filter/sort on fixtures (h7) · **D2.4** PlanetPage layout with `<Measurement>` and viewport slots (h9) · **D2.5** ComparePage table + SVG charts (h12) · **D2.6** HabitabilityPanel + FunFactList (h14) · **D2.7** responsive pass (h20) |
| **Teammate 3 — Backend + Data** [DATA] | `server/**` except AI, `services/api.js`, `science/constants|units|derived|catalogStats`, fixtures | **D3.1** fixtures for 5 planets in final shape (h1.5) · **D3.2** Express skeleton + `/api/health` (h2) · **D3.3** NASA fetch + normalize + provenance + snapshot (h5) · **D3.4** `/api/planets`, `/api/planets/:id` with cache + ETag (h6) · **D3.5** `services/api.js` + catalog loader for store (h7) · **D3.6** `catalogStats` (medians, percentiles) + `derived.js` with tests (h10) · **D3.7** deployment config (h19) |
| **Teammate 4 — AI + Research + QA** [AI] | `server/ai/**`, `routes/astronomer.js`, `components/ai`, `science/habitability|habitableZone|funFacts`, `audio/` | **D4.1** habitability research note: factors, thresholds, citations (h3) · **D4.2** `habitability.js` + `habitableZone.js` with tests (h8) · **D4.3** Featherless client + `/api/astronomer` with grounded prompts (h11) · **D4.4** AstronomerPanel (h13) · **D4.5** `funFacts.js` with tests (h15) · **D4.6** scientific verification checklist on 10 planets (h18) · **D4.7** bug triage during the freeze · **D4.8** pitch deck + demo script (h22) · stretch: soundscape |

If only three people are available, the lead absorbs the AI route and Teammate 2 absorbs QA.

**Ownership rules**
1. You edit only files you own. You need something in someone else's file? Open a GitHub issue or post in team chat with the exact interface you need. The owner implements it.
2. Cross-workstream code meets only at the contracts below. If a contract must change, the lead updates `src/contracts/` and this file first, then announces it.
3. `App.jsx`, the router, the store, `package.json` and `vite.config.js` are edited only by the lead. Request a route or a dependency in chat.
4. Pages owned by UI embed 3D only through `three/viewports/*`. 3D pages use UI's primitives from `components/ui`. Neither reaches into the other's internals.

### 11.2 Contracts (frozen at hour 2; written as JSDoc in `src/contracts/`)

**Planet model:** §5. Fixtures in `src/data/fixtures/` match it exactly and include one sparse planet (most fields `missing`) and one eccentric orbit.

**HTTP API** [DATA, AI]. All errors: `{ error: { code, message } }` with a proper status.

```
GET  /api/health                → { ok, catalog: { count, generatedAt, source: "live"|"snapshot"|"fixtures"|null } }
GET  /api/planets               → { generatedAt, source, count, planets: Planet[] }
GET  /api/planets/:id           → { planet: Planet, system: Planet[] }        // system = same host, incl. itself
POST /api/astronomer            body { mode: "survivability"|"compare"|"ask", planetIds: string[], question?: string }
                                → { mode, planetIds, model, cached: bool,
                                    sections: [{ key, title, items: [{ text, basis: "observed"|"estimated"|"unknown"|"speculation" }] }] }
```
Survivability section keys: `survival`, `risks`, `lifeConditions`, `interesting`, `unknowns`, `earthComparison`.

**Client service** [DATA], `src/services/api.js`:
`getCatalog() → Promise<{planets, generatedAt, source}>`, `getPlanet(id) → Promise<{planet, system}>`, `askAstronomer(req) → Promise<AstronomerResponse>`. Each throws `ApiError { code, message, status }`.

**Store** [LEAD], `useCelestria` slices:
```
catalog:   { status: "idle"|"loading"|"ready"|"error", planets, byId, hosts, error, load() }
selection: { selectedPlanetId, selectedHost, select(id), selectHost(name) }
compare:   { compareIds (max 4), addCompare(id), removeCompare(id), clearCompare() }
settings:  { paused, timeScale, reducedMotion, setPaused(b), setTimeScale(n) }
```

**Science functions** (pure, take a Planet, return `null` for missing inputs):
- [AI] `assessHabitability(planet) → { tier: { key, label }, factors: [{ key, label, status: "favorable"|"uncertain"|"unfavorable"|"unknown", inputs: Quantity[], explanation }], notes: string[] }`
- [AI] `habitableZone(teffK, lumLog) → { conservative: [innerAU, outerAU], optimistic: [innerAU, outerAU] } | null`
- [AI] `getFunFacts(planet, stats) → [{ id, text, fields: string[], basis: "measured"|"calculated"|"estimated" }]`
- [DATA] `computeCatalogStats(planets) → { medians: {...}, percentile(field, value) }`
- [LEAD] `orbitalElements(planet) → { P, a, e, i, omega, tp, assumptions: string[], anchored: bool } | null`
- [LEAD] `orbitState(elements, tDays) → { x, y, z, rAU, speedKmS, trueAnomaly, phase }`
- [LEAD] `travelTimes(distancePc) → [{ label, speedKmS, years }] | null`

**3D viewports** [LEAD], `src/three/viewports/`. Each one owns its own `<Canvas>`, Suspense and error fallback, and fills its parent box (the parent sets the size):
```
<HeroScene />                                                   // landing background
<PlanetViewport planet size="hero"|"card" autoRotate? interactive? />
<SystemViewport host planets selectedId onSelectPlanet paused timeScale />
<StarMapViewport hosts onSelectHost />
<SizeCompareViewport planets includeEarth includeSun mode="visibility"|"true" />
<JourneyViewport planet speedKmS />
```
Every viewport shows the "Artistic impression" and "Not to scale" labels itself, so pages never need to.

**Fixtures-first rule:** until D3.4 is merged, the store's `load()` reads fixtures. Switching to the live API is a one-line change in `services/api.js`, not in any page.

### 11.3 Git workflow
- `main` is always demo-able. The lead merges. Branch `feat/<area>-<short-name>` with area ∈ `3d | ui | data | ai` (e.g. `feat/3d-procedural-planet`).
- Small PRs (< 400 lines). A PR description lists the deliverable ID (e.g. D3.3) and how to test it. Squash-merge.
- Integration windows: the lead merges at h4, h8, h12, h16 and h19. Pull `main` after each.
- Commit `package-lock.json` only through the lead. Never commit `.env`.

---

## 12. 3D implementation roadmap (Lead)

**Priority order:** `PlanetViewport` + `SystemViewport` (core) → Orbital Simulator (P0 feature) → `HeroScene` → `SizeCompareViewport` (secondary) → `StarMapViewport`, `JourneyViewport` (stretch).

**Rules**
- **Quality gate.** No stretch or secondary 3D work starts until the core passes its quality bar: the planet renderer looks polished for every archetype, the system viewer is smooth (≥ 50 fps on an integrated GPU) and works with sparse data, and both are merged.
- **Modular by construction.** Each viewport is self-contained: own `<Canvas>`, Suspense, error fallback, and props-only inputs (no store reads inside `three/`). Shared parts (`ProceduralPlanet`, `Star`, `Starfield`, `OrbitPath`, `CameraRig`) take plain props and never import pages.
- **Develop in isolation.** The dev-only `/lab` route (`src/three/lab/`) mounts any viewport against any fixture with prop toggles. Each milestone is first proven in the lab, then integrated into a page.
- **Hours are guides, not deadlines.** If a core milestone needs more time, take it from secondary and stretch work, never from core polish.
- **Science rules still apply.** Provenance (§1, §5), imputation limits (F9), and scale labels (§1.7) hold in every scene.

| # | Guide | Tier | Milestone | Done when |
|---|---|---|---|---|
| **M0** | 0–2 h | — | **Foundations**: git, CELESTRIA rename, approved deps, router shell + placeholder pages, store, `src/contracts/`, `scale.js` (+ tests), `/lab` stub, server health stub | Teammates can branch, run `npm run dev`, and see routed placeholder pages; lint, tests and build pass |
| **M1** | ~2–6 h | Core | **PlanetViewport**: `archetype.js`, `visualParams.js` (imputation flags), shared geometry, rocky / sub-Neptune / Neptune-like / giant / unclassified shaders, temperature palettes, fresnel atmosphere, name-hash seed, lighting, "N of M measurements" badge | Fixtures render distinct, polished planets in the lab; an all-null planet renders as "unclassified" without errors |
| **M2** | ~6–10 h | Core | **SystemViewport**: blackbody star colour + corona shader, `Starfield`, `OrbitPath`, compressed orbit scale, orbital motion, click to select, pause/resume, `CameraRig` focus transitions; `ExplorePage` | A multi-planet system orbits smoothly; clicking flies the camera to a planet; ≥ 50 fps; sparse planets still placed and labelled |
| **M3** | ~10–13 h | Core (P0) | **Orbital Simulator**: `kepler.js` (+ tests), `useOrbitClock`, `OrbitScene` (star, planet, path only), slider bound to `t`, step/play/speed/reset, phase and elapsed readouts, info panel with provenance, assumption banners | An eccentric orbit visibly speeds up at periastron; the slider scrubs the real position; missing-e planets show the circular-orbit banner |
| **M4** | ~13–15 h | Core | **Integration + core polish**: viewports in PlanetPage, live API, loading/error states, code splitting, camera easing, dispose checks | Catalog → profile → explore → orbit simulator works end-to-end on live data. **Quality gate review.** |
| — | ~15–17 h | — | *Sleep / buffer* | |
| **M5** | ~17–18 h | Next | **HeroScene**: landing background built from existing planet + star + starfield parts | The landing hero animates smoothly and is cheap enough to never drop frames on the landing page |
| **M6** | ~18–19.5 h | Secondary | **SizeCompareViewport**: Earth/Sun, true vs visibility mode, labels, dashed "radius unavailable" body | Compare page shows planets + Earth with correct ratios in true mode |
| **M7** | ~19.5–20 h | Stretch | **StarMapViewport** (one `Points`, picking, fly-in) and/or **JourneyViewport** (spacecraft, path, travel-time assumptions). Fallbacks in §13 | Only if M1–M6 are merged and polished |
| — | 20 h | — | **Feature freeze** | |
| **M8** | 20–22 h | — | **Polish + performance**: optional bloom, reduced motion, dpr tuning, mobile canvas sizing, memory check | No console errors; memory stable after 20 page changes; fps target met |
| **M9** | 22–24 h | — | **Final integration + demo hardening**: pre-cache AI answers, snapshot fallback check, deploy, rehearse | The production URL runs the full demo path twice in a row |

**Lead's integration checkpoints:** review UI/DATA/AI PRs at each merge window (about h4, h8, h12, h16, h19; shift them with the milestones). Keep each window under 30 minutes so core 3D work keeps moving.

---

## 13. Scope fallbacks (cut in this order if late)

1. F10 Soundscape → single ambient drone, or cut.
2. F7 Journey → 2D Motion animation + travel-time table instead of a 3D scene.
3. Star map → curated list of ~20 notable systems (stretch).
4. AI compare summary and free-form "ask" → keep only the survivability assessment.
5. F4 → keep only the visibility-scale mode with a label.
6. Comparison charts → table with bar sparklines.
7. Postprocessing, GLB models, SSE streaming → skip.

**Never cut:** honest provenance/missing-data handling, the 3D viewer, profiles, habitability factors, the dedicated orbital simulator, and the server-side key.

## 14. Conventions

- JavaScript (no TS), function components, hooks. Files: `PascalCase.jsx` for components, `camelCase.js` for logic.
- Science functions are pure, take SI or documented units, return `null` (not `NaN`/0) when inputs are missing, and have tests.
- Physical constants live only in `science/constants.js`. Every derived value records its formula in a comment.
- UI copy: precise, calm, scientific. Every number has units. Show significant figures to match the precision of the data, not arbitrary decimals.
