# CELESTRIA

**Explore Worlds Beyond Our Solar System.**

An interactive 3D exoplanet exploration platform built on NASA Exoplanet Archive data, with a grounded AI astronomer.

Project rules, architecture, ownership and the roadmap live in [CLAUDE.md](CLAUDE.md). Read it before your first PR.

## Getting started

```bash
npm install
cp .env.example .env      # add your Featherless key (server-side only)
npm run dev               # web on http://localhost:5173, API on :8787
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite + API server together |
| `npm run dev:web` / `npm run dev:server` | one side only |
| `npm test` | unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run build && npm start` | production build served by the API server on :8787 |
| `npm run data:snapshot` | refresh the NASA catalogue snapshot (6,451 planets in Oct 2026) |

The app reads the NASA Exoplanet Archive catalogue from a committed snapshot (`server/data/catalog.snapshot.json.gz`), so it works offline. The dev-only 3D sandbox is at `/lab`.

## Contributing

1. `git switch main && git pull`
2. `git switch -c feat/<area>-<short-name>`  (area: `3d`, `ui`, `data`, `ai`)
3. Edit only files your workstream owns (see CLAUDE.md §4 and §11).
4. `npm run lint && npm test` before pushing.
5. Open a PR to `main` with the deliverable ID (e.g. D3.3) and how to test it. The lead reviews and squash-merges.
