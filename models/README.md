# Model comparison — first-principles runs

Each model derived the GKN MMA hazard (blast + toxic plume) from first principles.
These are the raw numbers behind the "Model Comparison" overlay. See
[`results.json`](results.json) for the full scenario, prompts, and each model's method.

- **Models:** Claude (Anthropic), Grok 4 (xAI), Gemini 2.5 Pro (Google), GPT-5 (OpenAI).
- **Scenario:** single 34,000-gal MMA tank (~7,000 gal involved), MW 100, liquid density
  0.94 kg/L, vapor ≈ 3.4× air; wind 8 mph (3.6 m/s), Pasquill D, urban.

## Blast (TNT-equivalent)

`W = m · ΔH_c · η / E_TNT` with ΔH_c ≈ 26.4 MJ/kg, E_TNT = 4.6 MJ/kg; radii by
Hopkinson–Cranz `R = k·W^(1/3)`. The spread comes from each model's chosen VCE yield η.

| Model | TNT (t) | Yield η | Glass-break |
|---|---|---|---|
| Gemini 2.5 Pro | 4.3 | 3 % | 309 m |
| Claude | 7.1 | 5 % | 328 m |
| Grok 4 | 7.2 | 5 % | 386 m |
| GPT-5 | 14.3 | 10 % | 340 m |

## Toxic plume — three dispersion models, ERPG-2 (75 ppm) downwind distance

All anchored at ~4 kg/s pool evaporation, 8 mph. Distance scales `~Q^0.5` with source rate.

| Model | Dense-gas (B-M) | DEGADIS (two-phase) | Neutral Gaussian |
|---|---|---|---|
| Gemini 2.5 Pro | 111 m | 520 m | 181 m |
| Claude | 850 m | 680 m | 200 m |
| Grok 4 | 900 m | 720 m | 231 m |
| GPT-5 | 1800 m | 95 m | 129 m |

- **Britter–McQuaid (B-M):** empirical dense-gas correlation — heavy cloud hugs the
  ground, farthest reach.
- **DEGADIS (two-phase):** gravity slumping (Richardson-number controlled) handing off
  to a passive Gaussian once `Ri_b < ~0.1`, with a virtual source matched to the
  flattened cloud. Lands between B-M and a neutral plume.
- **Neutral Gaussian:** passive gas that lofts and dilutes — lower bound; understates a
  dense gas like MMA. Retained here for reference; not exposed in the UI.

The spread across models is driven mostly by each model's evaporation source-term, not
by the dispersion math. All figures are screening-level (±factor 2–3).
