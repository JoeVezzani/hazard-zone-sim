# GKN Aerospace — Hazard Zone Simulator

Interactive consequence-model for a chemical tank emergency, rendered on a live
Leaflet/OpenStreetMap map of Garden Grove, CA. Drag the sliders to recompute
blast rings, a Gaussian toxic-vapor plume, and the evacuation footprint in real time.

**Live:** https://joevezzani.github.io/hazard-zone-sim/

It models a methyl methacrylate (MMA) tank vapor-cloud explosion: TNT-equivalent
blast radii (fireball → glass-break) and a Pasquill-D Gaussian plume (IDLH / ERPG-2 /
ERPG-1 isopleths) carried downwind. All math runs client-side — no backend.

## Editing this site

The entire site is **one file**: [`index.html`](index.html) (inline CSS + JS).
There is no build step and no framework.

1. Edit `index.html`.
2. Preview locally:
   ```bash
   python3 -m http.server 8000
   # then open http://localhost:8000
   ```
3. Commit and push to `main`.

**Pushing to `main` deploys automatically.** GitHub Pages rebuilds within ~30–60s,
and your change is live at the URL above. No secrets, no CI config to touch.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app — markup, styles, map logic, physics. Edit this. |
| `og.png` | 1200×630 social share image (Open Graph / Twitter card). |
| `.nojekyll` | Tells GitHub Pages to serve files verbatim (skip Jekyll). |

## If you regenerate the share image

`og.png` is a 1200×630 screenshot of the desktop layout. If you change the look,
re-shoot it (any headless-browser screenshot of the page at 1200×630 works) and
keep the dimensions so the `og:image:width/height` meta tags stay accurate.

## Notes

This is an educational / situational-awareness visualization. The dispersion and
blast figures are first-order engineering approximations (Gaussian plume + cube-root
TNT scaling), not a substitute for professional emergency modeling.
