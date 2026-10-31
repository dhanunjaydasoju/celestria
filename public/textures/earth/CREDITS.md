# Earth textures — sources and credits

Used only by the homepage Earth scene (`src/three/earth/`). Exoplanets stay procedural (CLAUDE.md §6, "Procedural planet renderer"; Earth exception in the same section).

All three source images are NASA works. NASA's media guidelines state that NASA imagery is "generally not subject to copyright in the United States", may be used for educational or informational purposes and on web pages, that "NASA should be acknowledged as the source of the material", and that use must not imply NASA endorsement. NASA logos/insignia are not used. Guidelines: https://www.nasa.gov/nasa-brand-center/images-and-media/ (checked 2026-11-01).

| File(s) | Source image | Producer / credit line | Source page |
|---|---|---|---|
| `earth-day-4096.jpg`, `earth-day-2048.jpg`, `earth-day-512.jpg` | Blue Marble: Next Generation, base map with topography, **August 2004**, `world.topo.200408.3x5400x2700.jpg` (5400×2700, 8 km/px) | "NASA Earth Observatory" — produced by Reto Stöckli, NASA Earth Observatory (NASA Goddard Space Flight Center). The page asks: *"Anyone using or republishing Blue Marble: Next Generation please credit 'NASA Earth Observatory.'"* | https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/ |
| `earth-night-2048.jpg`, `earth-night-1024.jpg` | Black Marble **2016**, colour, 0.1° global map, `BlackMarble_2016_01deg.jpg` (3600×1800), Suomi NPP VIIRS | NASA Earth Observatory | https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps |
| `earth-clouds-2048.jpg`, `earth-clouds-1024.jpg` | The Blue Marble (2002), **clouds** layer, `cloud_combined_2048.jpg` (2048×1024), Terra MODIS composite | "Image by Reto Stöckli (land surface, shallow water, clouds). Enhancements by Robert Simmon." NASA Goddard Space Flight Center. *"These images are freely available to educators, scientists, museums, and the public."* | https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/ |

**Processing:** resized with macOS `sips` and re-encoded as JPEG (quality 70–82). No other edits; colours are adjusted only at render time in the shaders. Clouds are a fixed 2002 composite (not live weather); their drift in the scene is artistic.

**Original downloads (SHA-256):**
- `world.topo.200408.3x5400x2700.jpg` — 3dd0e487d9cc0fe5fd85c3912c3782473bd50efd9ac1b5b7edf74b3733ca18b1
- `BlackMarble_2016_01deg.jpg` — d87de751a264e4f8ff69c68de5dab9606daee87a6f15ae743c93200743bd7ec1
- `cloud_combined_2048.jpg` — daddaad84d7a33bbbc86cdda3f591099f57cee8607b7bcf3b67eb7e4f7a1c793

**On-screen credit (homepage):** "Earth imagery: NASA Earth Observatory (Blue Marble, Black Marble)."
