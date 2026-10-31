# Habitability indicators — methodology

**Status:** implemented by LEAD in M5 Phase B, **pending science review by Teammate 4** (owner of `src/science/habitability.js` and `habitableZone.js` per CLAUDE.md §4). Every threshold and sentence of user-facing wording below is open for review; change the constants in code and this document together.

## 1. Principles

1. **Indicators, not a verdict.** Each planet gets a list of independent indicators, each with a status (*Favourable · Uncertain · Unfavourable · Unknown · Context only*), its inputs and a one-line explanation. There is **no score, percentage or probability** anywhere.
2. **Habitable-zone placement is an estimate, not habitability.** It says where a planet's stellar flux falls relative to climate-model boundaries for an Earth-like atmosphere. Every view carries: *"Habitable-zone placement is not evidence of habitability or life."*
3. **Only NASA values and values calculated from them.** Inputs are read with `scienceValue()` / `isScientific()`, so median-imputed values (CLAUDE.md §5a) can never enter; an imputed input is shown as Unavailable.
4. **Uncertainty is kept and used.** NASA's asymmetric errors are carried into the flux interval and the star-temperature interval; a planet whose interval crosses a boundary is marked as *straddling* it.
5. **Atmosphere is always Unknown.** The NASA catalogue has no atmospheric data; nothing is assumed.

## 2. Habitable-zone boundaries

Kopparapu, R. K. et al. 2014, ApJL 787, L29, *Habitable Zones around Main-sequence Stars: Dependence on Planetary Mass* ([arXiv:1404.5292](https://arxiv.org/abs/1404.5292)).

```
S_eff = S_eff☉ + a·T + b·T² + c·T³ + d·T⁴,    T = Teff − 5780 K
d_AU  = sqrt( (L★/L☉) / S_eff )
```

Coefficients (1 M⊕; verified against the authors' calculator `hzcalc.py`, R. Kopparapu 2014, Python port J. Armstrong 2014):

| Limit | S_eff☉ | a | b | c | d | Role |
|---|---|---|---|---|---|---|
| Recent Venus | 1.776 | 2.136e-4 | 2.533e-8 | −1.332e-11 | −3.097e-15 | optimistic inner |
| Runaway greenhouse | 1.107 | 1.332e-4 | 1.580e-8 | −8.308e-12 | −1.931e-15 | conservative inner |
| Maximum greenhouse | 0.356 | 6.171e-5 | 1.698e-9 | −3.198e-12 | −5.575e-16 | conservative outer |
| Early Mars | 0.320 | 5.547e-5 | 1.526e-9 | −2.874e-12 | −5.011e-16 | optimistic outer |

(5 M⊕ and 0.1 M⊕ runaway-greenhouse rows are stored but not used.)

Check: for the Sun (5780 K, L = 1 L☉) the code gives 0.950–1.676 AU (conservative) and 0.750–1.768 AU (optimistic), matching the paper.

**Validity.** 2,600 K ≤ Teff ≤ 7,200 K (edges included), main-sequence stars only. Outside the range, or for hosts with luminosity class I–III in the catalogue spectral type, placement is *not computed* and the reason is shown. Class IV (subgiant) hosts are placed, but a favourable result is downgraded to Uncertain.

## 3. Planet flux

1. NASA catalogue insolation (`pl_insol`, S⊕), as measured or NASA-calculated.
2. Otherwise `S = (L★/L☉)/(a/AU)²` from catalogue `st_lum` and `pl_orbsmax`, labelled **calculated**, with relative uncertainty `√((ln10·σlogL)² + (2σa/a)²)` (larger side of each error).
3. Limits (`<`/`>`) only allow a one-sided statement (e.g. an upper limit below the Early Mars flux is "colder").

Measured eccentricity ≥ 0.1 (with an uncertainty): periastron flux `S/(1−e)²` and apoastron flux `S/(1+e)²` are reported, and crossing a boundary along the orbit is flagged. Placement itself uses the flux at the semi-major axis.

## 4. Placement categories

From most to least starlight; a flux exactly on a boundary belongs to the zone it bounds.

| Key | Meaning |
|---|---|
| `hot` | more starlight than Recent Venus |
| `optimistic_inner` | between Recent Venus and runaway greenhouse |
| `conservative` | between runaway greenhouse and maximum greenhouse |
| `optimistic_outer` | between maximum greenhouse and Early Mars |
| `cold` | less starlight than Early Mars |

**Straddling:** placements are evaluated at flux − σ₋, flux, flux + σ₊ and at Teff − σ, Teff, Teff + σ (boundary shift). More than one resulting category ⇒ straddles.

## 5. Indicators and thresholds

| Indicator | Rule | Favourable | Uncertain | Unfavourable | Reference |
|---|---|---|---|---|---|
| Flux / placement | §4 | conservative, not straddling, orbit not crossing | optimistic only; or straddling; or crossing; or subgiant | hot/cold, not straddling | Kopparapu et al. 2014 |
| Size | radius thresholds **1.6** and **2.5 R⊕** | ≤ 1.6 R⊕ incl. uncertainty | 1.6–2.5; interval spans a threshold; NASA-calculated radius; imaging-model radius | > 2.5 R⊕ | Rogers 2015; Fulton et al. 2017 |
| Mass | **0.1–10 M⊕** | measured true mass inside incl. uncertainty | interval spans an edge; M sin i ≤ 10; mass–radius estimate; imaging model ≤ 10 | outside incl. uncertainty; M sin i > 10 | CLAUDE.md F6A; Kopparapu et al. 2014 mass range |
| Surface gravity | g = G·M/R² from measured true mass and radius | — | — | — | context only, no threshold |
| Equilibrium temperature | catalogue value | — | — | — | context only (albedo assumed, no greenhouse) |
| Host star | M dwarf if spectral class M, or Teff < **3,900 K** with no type | FGK-range, no caveat | M dwarf (flares, likely tidal locking); Teff < 2,600 K | Teff > 7,200 K (short-lived) | Shields et al. 2016 |
| Atmosphere | — | — | — | — | always **Unknown** |

## 6. Summary tiers (qualitative labels)

| Key | Label | When |
|---|---|---|
| `hz_small` | Habitable-zone flux · size in the rocky range | flux in a zone, size Favourable, mass not Unfavourable |
| `hz_mid` | Habitable-zone flux · size uncertain | flux in a zone, size Uncertain |
| `hz_large` | Habitable-zone flux · likely volatile-rich size | flux in a zone, size Unfavourable |
| `hz_massive` | Habitable-zone flux · mass above the rocky range | flux in a zone, size not Favourable, mass Unfavourable (incl. M sin i > 10 M⊕) |
| `hz_nosize` | Habitable-zone flux · size unknown | flux in a zone, no radius |
| `hot` / `cold` | More / Less starlight than the habitable zone | flux Unfavourable |
| `unsupported` | Star outside the habitable-zone model | Teff out of range or evolved host |
| `insufficient` | Insufficient data for placement | no flux, no Teff, or an indecisive limit |

Labels describe indicators, never habitability.

## 7. AI astronomer

- `assess_habitability` (deterministic tool) returns the placement, boundaries (calculated, with basis), planet flux and star temperature with provenance and uncertainty, and the indicators.
- The validator accepts a habitable-zone placement claim only if a result of this tool for the named planet (or its host star) supports it, and only with basis *calculated* (or a hedged hypothesis). Unqualified "in the habitable zone" means the conservative zone; "near the edge" requires a straddle or an orbit crossing. Claims that a planet is habitable, uninhabitable or has life remain forbidden.

## 8. Open questions for review

1. **TRAPPIST-1 (2,566 K) is just below the model range** and is shown as "outside the model". Allow a small extrapolation (e.g. to 2,500 K) with a warning?
2. Are 1.6 / 2.5 R⊕ and 0.1–10 M⊕ the thresholds we want to present? (Some studies use 1.5 R⊕ or 5 M⊕.)
3. Should the 0.1 M⊕ / 5 M⊕ runaway-greenhouse limits be used when a planet's mass is measured?
4. Flux for eccentric orbits: use the time-averaged flux `S/√(1−e²)` for placement instead of the flux at the semi-major axis?
5. Most hosts have no luminosity class in the catalogue, so evolved stars are only excluded when the class is listed. Use `st_logg` (not yet ingested) as an additional test?
6. Wording review of every explanation string in `src/science/habitability.js`.
