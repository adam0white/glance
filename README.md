# The Glance

[Play The Glance](https://glance.adamwhite.work).

You work at the river authority’s night desk. Keep water below the top of the dam. Keep the town dry, or warn people before it floods. By default, you work five nights, Monday to Friday. The week ends at Friday’s first light, or when water comes over the dam.

For a new game, “A longer watch” is unchecked. Selecting it starts the `extended-1` watch: twelve nights through the second Friday, at Valley or Upper dam. Upper has longer walks and slower water routing to town. Water keeps flowing between nights.

Every reading on the board is a keeper’s report. It can be wrong. “Read” is the time he wrote down, including any mistake. “Reported” is when his report reached you.

## How to play

- Tap a gauge to inspect it and choose a job. Tap the job button to ask the keeper. Hold it to insist.
- Ask for readings, change the gate opening and let the keeper rest between jobs. Opening the gate lowers the reservoir, but raises the river through town later.
- When available, call Nerys at the Bridge Inn for another observation. Hold Warn Mill Lane to send the warden to knock on doors.
- Compare observations. You can mark a received reading for another check. This is your note; it does not tell the keeper or establish that the reading is wrong.
- Time runs automatically. Inspections, information and the menu stop time. Skip ⏩ advances toward a pending event; it is unavailable during radio silence.
- At dawn, compare the actual water curve with the reported readings. Earlier morning pages remain available at the desk. The tally is optional at the end.

In the longer watch, a standing request waits for a new local level reading; the keeper can refuse or defer the gate work. Bilal may accept paid relief gauge rounds after travel and briefing. He has no gate or engineering authority. Compare the keepers’ received figures and mark doubts for the dawn review of known outcomes. Readings and written times remain uncertain. Dawn practice runs a separate branch without changing the actual save, history or recording. Sleeping keepers give no forecast.

The information button explains the current screen. The menu offers Resume, Feedback, Full screen, All games, one recording switch and New game with confirmation.

## Saves, recording and replay

The game saves progress in this browser. If saving fails, keep the page open while it retries. New game replaces the saved week only after the new week is ready.

Recording links recorded play across games on this device. Use “Record play for the lab” in the menu to switch it off. Feedback sends a note; it is separate from saving progress. Feedback includes “I’m stopping” and “I’m confused”. Selecting either sends nothing; use Submit to send it with your optional verdict and note. A note receipt does not prove that optional run chunks arrived.

Ordinary new chapters automatically check browser histories for the five cast members. A loaded chapter keeps its admitted people. Continuation depends on compatible source histories and successful admission; it is not a shared multiplayer world or cross-device save.

With `?lab=1`, the title/menu expose diagnostic import/export, browser-person controls and Automatic / Slow / Steady / Fast pacing. Downloaded runs include their source archive. Import replays the seed, inputs and pinned chapter, then checks the complete state. Current exports use `glance@4-deterministic-water`, with person-transfer rules `glance-4`. Files from other versions receive a start-fresh refusal. Importing a file does not take ownership of the people in it.

## Human Framework and development

The [Human Framework](https://github.com/adam0white/human-framework) supplies the people’s bodily state, fatigue, perception, fear, trust and responses to requests. Glance uses those states to produce uncertain keeper reports. Glance owns the water model, weather, gauges, dam, jobs, town warning and outcomes.

The exact package pin is `@adam0white/human-framework@3.0.0`; its simulation engine is `2.23.0`. Glance’s package version is `0.1.0`, distinct from its export edition. The immutable lab artifacts are client `0.4.11` and kit `0.5.12`.

Use Node 24 or later and TypeScript 7 or later.

- `npm run dev`: play locally.
- `npm run check:lane`: run this repository’s full lint, typecheck and locked test lane before a commit.
- `npm run measure`: run headless policies over seeded weeks.
- `npm run deploy`: check, build and deploy to Cloudflare.

Design: [docs/design.md](docs/design.md). Playtests: [docs/playtests/](docs/playtests/). Framework requests: [docs/hf-requests.md](docs/hf-requests.md). Delivery evidence and limits: [HANDOFF.md](HANDOFF.md).

MIT licence. The water model also preserves the [Sun fdlibm notice](public/THIRD-PARTY-NOTICES.txt).
