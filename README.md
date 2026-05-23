# GKN Aerospace — Hazard Zone Simulator

Interactive consequence-model for a chemical tank emergency, rendered on a live
Leaflet/OpenStreetMap map of Garden Grove, CA. Drag the sliders to recompute
blast rings, a Gaussian toxic-vapor plume, and the evacuation footprint in real time.

**Live:** https://joevezzani.github.io/hazard-zone-sim/

It models a methyl methacrylate (MMA) tank vapor-cloud explosion: TNT-equivalent
blast radii (fireball → glass-break) and a Pasquill-D Gaussian plume (IDLH / ERPG-2 /
ERPG-1 isopleths) carried downwind. All math runs client-side — no backend.

**Live weather:** the fallout plume + evacuation wedge are aimed by real-time wind
from the public [Open-Meteo](https://open-meteo.com) API (no key). A time scrubber
at the bottom replays ~60 h of past hourly wind plus a short forecast, so you can
watch how the wind — and the fallout — shifts hour by hour. Observed conditions
(temp, wind, gusts, humidity) show in the sidebar and the on-map badge.

**Real vs modeled (important):** the **facility location** and the **official OCFA
evacuation order** (yellow box — N of Garden Grove Blvd, E of Monarch St, S of
Orangewood Ave, W of Beach Blvd, ~40,000 residents) are real/authoritative. The
**blast rings and toxic plume are modeled estimates**, not official guidance.

MMA vapor is ~3.4× as dense as air, so the plume uses a **simplified dense-gas
correction** (suppressed vertical mixing + gravity slumping): it hugs the ground,
pools outward in all directions near the source, and holds high concentrations
farther downwind than a neutral plume.

_Roadmap (v3): full Britter-McQuaid dense-gas model, and a windalert-style
wind-speed color field overlay that stays legible as you zoom out._

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
