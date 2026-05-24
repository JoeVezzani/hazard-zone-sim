# GKN Aerospace — Hazard Zone Simulator

Interactive consequence-model for a methyl methacrylate (MMA) tank emergency,
rendered on a live Leaflet / OpenStreetMap map of Garden Grove, CA. Drag the sliders
to recompute the blast rings, the toxic-vapor plume, and the evacuation footprint in
real time. All math runs client-side — no backend, no key.

**Live:** https://joevezzani.github.io/hazard-zone-sim/

**Real vs modeled (important):** the **facility location** and the **official
evacuation order** (yellow box — N of Trask Ave, S of Ball Rd, E of Valley View St,
W of Dale St; ~40,000 residents) are real/authoritative. The **blast rings and toxic
plume are modeled estimates**, screening-level (±factor 2–3), not official guidance.

---

## The math

### 1. Blast — vapor-cloud explosion (VCE)

Fuel mass from the spilled/involved volume:

```
m  = V_gal × 3.785 L/gal × 0.94 kg/L          (MMA liquid density ≈ 0.94 kg/L)
```

TNT-equivalent yield (energy basis):

```
W_TNT = m × ΔH_c × η / E_TNT
        ΔH_c  ≈ 26.7 MJ/kg   (MMA net heat of combustion)
        E_TNT = 4.6  MJ/kg   (TNT)
        η     = VCE yield, 1–10 % of fuel energy coupling to blast
```

Overpressure radii by cube-root (Hopkinson–Cranz) scaling, `R = k · W_TNT^(1/3)`,
for four damage bands: fireball/total destruction, severe (~10 psi), moderate
(~3 psi), glass-break/eardrum (~1 psi).

**Cascade:** each adjacent tank that detonates adds its full inventory to the fuel
mass, so `W_TNT ∝ V_total` and every radius scales with `V_total^(1/3)`.

> TNT-equivalent is blast **energy** only — it is not a measure of radiation or fallout.

### 2. Toxic plume — dispersion

Health thresholds and the ppm → mass-concentration conversion (MMA, MW = 100):

```
IDLH   1000 ppm  (lethal)
ERPG-2   75 ppm  (serious health effects)
ERPG-1   10 ppm  (irritation)

C[g/m³] = ppm × MW / 24450
```

**Source rate drives reach.** The plume footprint is set by the evaporation/venting
rate `Q` (kg/s), not the tank's total volume. Distance to a given threshold scales
sub-linearly with the source and weakly inverse with wind:

```
d(Q,u) = d₀ · (Q / Q₀)^0.5 · (u₀ / u)^0.3
         Q₀ = 4 kg/s,  u₀ = 8 mph   (anchor conditions for d₀)
```

The exponent ≈ 0.5 comes from the Gaussian dispersion coefficients growing with
downwind distance, so even a very large source only stretches the footprint modestly.

**Cascade:** leak rate is **per tank**. `N` failing tanks give an effective source
`Q = leak × N`, so the plume grows with the cascade alongside the blast.

MMA vapor is ≈ 3.4× as dense as air, so the cloud slumps and resists vertical mixing.
Two dense-gas dispersion models are offered:

- **Britter–McQuaid (B-M)** — empirical dense-gas correlation. The heavy cloud hugs
  the ground and holds concentration farthest downwind. Largest footprint.
- **DEGADIS (two-phase)** — US EPA / Coast Guard model. A gravity-driven slumping
  phase, with vertical mixing suppressed, governed by the bulk Richardson number

  ```
  Ri_b = g' · L_v / u*²        g' = g (ρ_c − ρ_a) / ρ_a   (reduced gravity)
  ```

  hands off to a passive Gaussian phase once `Ri_b < ~0.1` (the cloud has entrained
  enough air that ρ_c → ρ_air), launched from a virtual source matched to the
  flattened cloud's width. DEGADIS lands between B-M and a neutral plume.

A neutral-Gaussian (passive-gas) solution is the lower bound — it lofts and dilutes
freely. It understates a dense gas like MMA, so it is documented in `models/` for
reference but not exposed in the UI.

### 3. Wind and direction

The plume travel bearing is `wind_from + 180°`. Live wind comes from the public
[Open-Meteo](https://open-meteo.com) API; a time scrubber replays ~48 h of past
hourly wind plus ~48 h of forecast, re-aiming the plume hour by hour.

### 4. Multi-model comparison

Each distance anchor (`d₀`) is taken from independent first-principles runs of four
LLMs (Claude, Grok 4, Gemini 2.5 Pro, GPT-5). The main map shows one model (default
GPT-5); the others overlay in their own colors for side-by-side comparison. The raw
numbers, prompts, and per-model methods are in [`models/`](models/).

---

## Editing this site

The entire site is **one file**: [`index.html`](index.html) (inline CSS + JS). No
build step, no framework.

1. Edit `index.html`.
2. Preview locally: `python3 -m http.server 8000` → open `http://localhost:8000`.
3. Commit and push to `main`.

**Pushing to `main` deploys automatically.** GitHub Pages rebuilds within ~30–60 s.
No secrets, no CI config to touch.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app — markup, styles, map logic, physics. |
| `models/` | First-principles model runs (numbers, prompts, methods) behind the comparison. |
| `og.png` | 1200×630 social share image (Open Graph / Twitter card). |
| `.nojekyll` | Tells GitHub Pages to serve files verbatim (skip Jekyll). |

## Notes

Educational / situational-awareness visualization. The dispersion and blast figures
are first-order engineering approximations (dense-gas screening + cube-root TNT
scaling), not a substitute for professional emergency modeling.
