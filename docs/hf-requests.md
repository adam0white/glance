# HF requests

Filed 2026-10-19 against HF 2.7.0, and appended to `~/code/human-framework/docs/game-requests-2026-10-18.md` ("The Glance"). None blocks the game; each has a host-side workaround, noted below.

1. **Forecast thresholds are not host-tunable** (confirmed by reading `prospection/forecast.js`). `forecast:body` and its narration use `comfortAt 0.8` and `spentAt 0.97`. A night keeper in the circadian trough lives at sleepiness 0.6 to 0.85, so the forecast line stays silent or jumps straight to "spent". Proposal: optional `{ comfortAt, spentAt }` per person or per call, defaults unchanged. Workaround: the game words the forecast from `bodyForecast(...).spans` on its own scale (below 0.66, below 0.8, above).
2. **No involuntary sleep onset** (confirmed: no faculty covers it). A keeper with high true sleepiness sitting still should sometimes fall asleep without choosing to (a microsleep or a doze), and wake on a sound. HF only sleeps by decision. Proposal: an opt-in `sleepOnset` hazard from true sleepiness, posture and stimulation, drawn from the person's seeded RNG, ending on a perceived salient percept. Workaround: the host rolls a doze from `readPerson(p).body` when sleepiness is above 0.84 by the stove, keyed by seed and minute.
3. **No faculty for reading a quantity** (confirmed: no API). Reading an instrument has an error that grows with true sleepiness, fatigue, fear and poor light, and a confidence that follows _perceived_ state, which is the whole game. Proposal: `estimate(p, { truth, difficulty })` returning `{ value, confidence }`, with error from true body state and confidence from perceived state; per-person bias left to the host. Workaround: `src/sim/reading.ts` in this repo (`clarityOf`, `errorSd`, `confidenceOf`), engineering assumptions, not sourced.
4. **Generic assent words repeat** (confirmed in the headless measure before the workaround: "Aye." 57 times in three seeded weeks). The same as rank 4 of the Rope's requests. Workaround: per-keeper line pools in the host, picked by a seed-and-minute hash so replay stays exact.

## Outcome (2026-10-19, HF 2.8.0)

- Item 1 is answered by `Affordance.forecastAt { comfortAt, spentAt }` and `forecastThresholds(aff)` in HF 2.8.0. The game sets `{ comfortAt: 0.78, spentAt: 0.97 }` on its work offers. Finding: the threshold is a cliff, not a dial. At `comfortAt` 0.74 and below, keepers refuse the wheel through the small hours and every policy except the oracle loses the dam by night 2 or 3 (measured at 0.66, 0.68, 0.70, 0.72 and 0.74). At 0.78, over 6 seeds: idle overtops 6/6, trusting 3/6, careful 4/6, oracle 0/6.
- Items 2 (involuntary sleep onset) and 3 (estimate a quantity) are deferred by HF to engine 2.10. The host workarounds stay.
- Item 4 stays host-side.
