# The Glance

[Play The Glance](https://glance.adamwhite.work).

You work at the river authority’s night desk. Keep water below the top of the dam. Keep the town dry, or warn people before it floods. Every new game runs twelve nights, through the weekend and a second week. The watch ends at the second Friday’s first light, or when water comes over the dam.

New games use the implemented `extended-2` / `private-scenes-1` rules without a gameplay switch. Choose Valley dam (the default) or Upper dam for a new game. Upper is harder, with longer walks and slower water routing to town. Water keeps flowing between nights. Current HF4 files retain their complete source history. Older HF3 files are refused before replacing the held watch; keep the original file. Starting again from the game menu uses the public twelve-night rules at Valley dam; return to the title to choose Upper.

Every reading on the board is a keeper’s report. It can be wrong. “Read” is the time he wrote down, including any mistake. “Reported” is when his report reached you.

## How to play

- Tap a gauge to inspect it and choose a job. Tap the job button to ask the keeper. Hold it to insist.
- Ask for readings, change the gate opening and let the keeper rest between jobs. Opening the gate lowers the reservoir, but raises the river through town later.
- When available, call Nerys at the Bridge Inn for another observation. Hold Warn Mill Lane to send the warden to knock on doors.
- Compare observations. You can mark a received reading for another check. This is your note; it does not tell the keeper or establish that the reading is wrong.
- Time runs automatically. In new games, inspections slow time. Information and the menu stop time. Current inspections slow time; information and menus hold time. Skip ⏩ advances toward a pending event; it is unavailable during radio silence.
- At dawn, compare the actual water curve with the reported readings. Earlier morning pages remain available at the desk. The tally is optional at the end.

In a new game, a standing request waits for a new local level reading; the keeper can refuse or defer the gate work. Bilal may accept paid relief gauge rounds after travel and briefing. He has no gate or engineering authority. Compare the keepers’ received figures and mark doubts for the dawn review of known outcomes. Readings and written times remain uncertain. Dawn practice runs a separate branch without changing the actual save, history or recording. Sleeping keepers give no forecast.

For catch credit at dawn, ask for the same gauge again within twenty minutes of the wrong reading. A lightning flash within twenty minutes also counts for a wrong level reading. In a new game, marking that report as doubted also counts. Older watch editions are historical HF3 evidence and cannot load in this version. These rules do not make a report certain.

The information button explains the current screen. The menu offers Automatic / Slow / Steady / Fast pace, Resume, Feedback, Full screen, All games, one recording switch and New game with confirmation.

## Saves, recording and replay

The game saves progress in this browser. If saving fails, keep the page open while it retries. New game replaces the saved week only after the new week is ready.

Recording links recorded play across games on this device. Use “Record play for the lab” in the menu to switch it off. Feedback sends a note; it is separate from saving progress. Feedback includes “I’m stopping” and “I’m confused”. Selecting either sends nothing; use Submit to send it with your optional verdict and note. A note receipt does not prove that optional run chunks arrived.

Ordinary new chapters check the five cast identities through the public SDK. Unsupported arrivals are skipped and named separately. The published SDK binds all five canonical Glance roles. Valid version2 inputs become actual mapped openings in the one public Run. Complete native preparation is committed and read back before the shelf claim; acknowledged claims are committed and read back before installation. Unknown outcomes keep the previous watch and their recoverable reservation. Every outgoing person publication is refused before writes; a complete native run remains available. This is a local HF4 foundation, not an executed residency or cross-host journey.

The browser worker owns the complete Run. File/native admission replays the complete source and rejects modified state or unknown ownership. Opening a large saved watch can take a substantial time. Cancel discards only the candidate and retains the held watch and original file. File play stays in a disposable in-memory session and retains exact selected original bytes and provenance. Capacity refusal keeps the accepted snapshot; it never truncates a history. See [current bridge limits](docs/hf48-bridge.md).

## Human Framework and development

The [Human Framework](https://github.com/adam0white/human-framework) supplies the people’s bodily state, fatigue, perception, fear, trust and responses to requests. Glance uses those states to produce uncertain keeper reports. Glance owns the water model, weather, gauges, dam, jobs, town warning and outcomes.

The exact package pin is `@adam0white/human-framework@4.8.0`. Glance’s package version is `0.1.0`, distinct from its export edition. The immutable lab artifacts are client `0.5.6` and kit `0.5.24`.

Use the shared Node 26.12.0 runtime (`.node-version` and `.nvmrc`), pnpm 12.14.0 and TypeScript 7 or later. Run `pnpm install --frozen-lockfile` before the commands below.

- `npm run dev`: play locally.
- `npm run check:lane`: run this repository’s full lint, typecheck and test lane without the shared suite lock before a commit.
- `npm run measure`: run headless policies over seeded weeks.
- `npm run deploy`: check, build and deploy to Cloudflare.

Design: [docs/design.md](docs/design.md). Playtests: [docs/playtests/](docs/playtests/). Framework requests: [docs/hf-requests.md](docs/hf-requests.md). Delivery evidence and limits: [HANDOFF.md](HANDOFF.md).

MIT licence. The water model also preserves the [Sun fdlibm notice](public/THIRD-PARTY-NOTICES.txt).

Dependency changes use pnpm and the committed `pnpm-lock.yaml`. The npm lock was imported with exact dependency versions preserved. Do not regenerate an npm lock or install a separate runtime per worktree. The pnpm policy uses strict engines/peers, no hoisting, hardlinks, a 24-hour third-party release delay and a scoped exemption for owned `@adam0white/*` packages.
