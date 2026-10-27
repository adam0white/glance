# The Glance: design

**One line.** A storm week on the night desk at the river authority. Up the valley, one old dam above a town, and on it a keeper with a torch and a radio. Every number on your board is what a tired man saw.

**Done for the first playable** (set 2026-10-19 by the coordinator's brief; the owner accepts feel separately): five playable nights with one new pressure each, a dawn logbook that draws the truth over the reports, an ending, a playtest export that replays, tests, a headless measure, a polish round with at least three source-unread playtesters recorded verbatim, live at https://glance.adamwhite.work.

## How it was chosen (2026-10-19)

Concept #1 of `human-framework/docs/game-taste-2026-10-19.md`, the owner's own idea: "the trusty HUD is all relative to how good their character is". Two consultants read only a brief (three settings, three loop shapes, the owner's taste and the lessons of The Night Watch, The Pass and The Rope), no source.

- **Game-design expert (Opus)** picked the dam and the rounds loop: "The dam fails in two directions you can name … every action is physical work for a person you can hear getting tired." Sending the keeper to read is a real decision because it costs his walking time, his tiredness and his absence from the gate wheel. A pure glance budget is "an abstract UI tax". Key rules: the river answers a release about 40 minutes later, so decisions are always in flight; confidence lives in the keeper's words (his perceived state), accuracy leaks only through tells drawn from his true state; the water balance lets a careful player catch a wrong reading in the moment; never 40 seconds without a voice. Cut: a simulated town. The town is one voice, one bridge and the houses on the dawn page.
- **Wildcard (Sonnet), Gwen, 61, thirty years a reservoir keeper in mid-Wales, plays on her phone between school-bus runs:** "A game that admits the gauge is only a man's say-so." What keepers really do when tired: round down, "because down is what they want"; report the same number twice "because they didn't go and look"; skip the far walk and say they did; "stop mentioning things, because they've stopped noticing. Silence is the warning." Gates stick, and "gate's moved" is not "gate's moved as far as I said". Phone-down list: a tutorial that tells her gauges can be wrong, lessons on human error, film dialogue, glowing needles, a rushing timer, stars before the night ends, a red lose screen, sad music. What brings her back: the dawn logbook, "finding he was reading low by his fourth hour, and thinking 'I should have known from how he wrote his sevens'", and a keeper who remembers being pushed. Wild idea, taken: ring someone with no gauge at all, the pub by the bridge, "a cross-check made of gossip". Her keepers, taken: **Dai, 63** (canonical correction: the source address is Mr Pugh; no full legal surname established), thirty-one years on the dam, "I'm grand", reads confidently and low; **Callum, 24**, agency, second week, reads high because he is frightened of missing it, "will do anything you say, which is the trouble".

## Core loop (settled)

1. **Read the board.** Four gauges, each holding the last reported value in crisp print, with the time it was taken. The ink fades as the report ages. The board always looks exact.
2. **Ask.** Tap a gauge or a job to radio the keeper. He walks there on the small map (time and tiredness), reads, and says it in his own words. Tap asks; press and hold insists.
3. **Weigh the man.** His confidence is in his words ("bang on", "near enough", "call it four-two") and comes from how he feels (HF perceived state). His accuracy comes from how he is (HF true state, circadian alertness, fatigue store, fear). Tells, never numbers: the same figure twice, a walk too short to have reached the weir, a yawn mid-number, a wrong time, loose handwriting.
4. **Decide.** Turn the spillway gate open or shut (the keeper's arms do it; he forecasts what it costs him through HF `bodyForecast`), let him rest, ring the inn by the bridge, warn the town.
5. **The river answers later.** The reservoir rises with rain that fell an hour ago; the bridge rises about forty minutes after a release. A lightning flash shows the true level for an instant. At dawn the logbook draws the true curve in red over his pencil dots, with the reason for each big miss.

Between crises the player plans his next walk ahead of the rain, trades his rest against fresh readings, and checks his figures against the water balance and the inn.

## The week (one new pressure a night, brought by a person or the weather)

| Night     | New pressure                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| Monday    | Dai alone. The level, the gate, rain. Learn that he reads low.                                                   |
| Tuesday   | The weir upstream and the Bridge Inn: Nerys at the window, and the town warning. False alarms cost her goodwill. |
| Wednesday | Callum arrives. Two keepers: who walks, who sleeps. He never says no.                                            |
| Thursday  | The radio drops in the wind; a tree comes down on the screen. Silence is the warning.                            |
| Friday    | The crest. Everything at once; the 1979 mark on the wall.                                                        |

The dam overtopping ends the week (the dawn page still comes). Achievement is the dawn overlay: your gate marks bracketing the true curve though his dots were off. "You read the man, not the gauge."

## Rules taken from the consults

1. A night is 22:00 to 06:00. Playback runs automatically: brisk quiet work, reading time for new radio words, and time held during an inspection or information popover. Each simulation minute still runs; the first new event ends a fast batch. The owner restored optional speed choices on 2026-10-22; see the updates below.
2. No meter for a person. State shows in words, handwriting, gait on the map and the dawn notes.
3. Every error has a cause in the keeper's true state and a tell the player could have read; the dawn page names the cause.
4. World randomness is keyed by seed, night and minute (pattern from The Pass), so one input never moves the storm.
5. Insisting gets compliance under protest and costs trust; it comes back in the dawn line and in later answers.
6. The town is not simulated: one voice, one bridge, a row of houses on the dawn page.

## The world (host side, `src/sim`)

- **Water.** Rain falls through a catchment (a linear store, about an hour's lag, wetter ground runs off more) into the reservoir; the gate releases by its opening and the head; above the crest the dam overtops. The bridge rises with the release (about forty minutes' lag) and with the town's own runoff.
- **Readings.** The keeper's read is the truth plus an error whose size grows as his true clarity falls and whose bias is his character (Dai low, Callum high, more so when afraid). His spoken confidence is computed the same way from his perceived state. Skipped walks and copied figures are host rolls from true sleepiness, keyed by the minute.
- **Noticing.** At the dam the keeper perceives what is there (the rain, the gate, a tree on the screen) through HF `perceive`, whose limited attention narrows with fatigue and fear. He mentions only what got through.

## Extended watch candidate (2026-10-25)

The original five nights remain the default. A new game can opt into “A longer watch”. New longer watches pin `extended-2`, with a Valley or Upper dam map. Saved `extended-1` watches retain their original catch rule, dialogue and empty later-night beat lists. No recorded history is rewritten. Unmarked runs keep their original decisions, RNG and replay. Both full imports and compact replay rebuild the pinned edition. The finite person-transfer projection stays `glance-4`: no new source dialect, skill recognition or body/calendar admission is added.

- The longer watch runs through Saturday and Sunday to the second Friday. The same five HF people retain actual fatigue, sleep, strain and histories. Weather remains keyed by seed and absolute night.
- Day cover sets the gate to one turn. Water flows through every intervening minute instead of assigning a new level. A daytime overtop ends the watch at its recorded time.
- Upper dam is labelled harder: it has a wider basin, slower routing to town and longer walks. Staff marks remain at the same heights. These are authored host maps, not an HF water planner.
- A standing request waits for a new local level reading, including during radio silence. A copied figure cannot trigger it. The keeper weighs the gate work through HF and can refuse or defer. It is a request, not an assurance of safety.
- Bilal can be invited for gauge rounds during his existing five-day visit. HF weighs the invitation; travel and briefing occupy about fifty minutes of his actual activity. He can read gauges after arriving. He never operates the wheel or clears the debris screen. There is no sixth maintained person or new engineering qualification. Cover must be arranged again each night. His travel starts at the actual invitation minute. The authored travel/briefing pay becomes a material outcome only on successful completion. The two visitors’ local scenes end after their five-day visits; their saved identities and histories remain.
- The weather bulletin gives a broad uncertain outlook. It does not expose keyed future peaks.
- The phone stage retains its useful dam scene above the order sheet. The sheet scrolls within the remaining space instead of forcing the whole desk to scroll.
- The live board retains each keeper’s latest actually received figure and written time. Radio-held reports stay hidden. A newer figure from one keeper does not erase another keeper’s disagreement.
- Doubt marks in the longer watch are compared at dawn with actual known outcomes, including accurate figures that the player doubted. In `extended-2`, a reread request or a wall flash within twenty minutes also credits a wrong reading, as in the original watch; doubt marks add another way to catch it. Saved `extended-1` watches keep doubt-only credit, and their help says so. The original watch retains its original catch rule. Neither mark reveals correctness during play.
- Nights 6–12 each add a desk observation from received reports or revealed morning pages: Callum’s Friday record, Saturday’s town outcome, the two keepers’ latest figures, the missing or received screen report, a report aging during radio silence, gate position versus screen clearance, and the need for a current town report. These lines do not inspect hidden water, held reports or private HF state. Storms, staffing, walking times and difficulty remain unchanged.
- The short watch remains the lab panel default; the longer watch is optional. The coordinator holds Glance R1 until the catch and edition-copy corrections are deployed. Choosing a short watch gives no second-week playtest evidence.
- A separate dawn practice branch replays the same pinned opening and prior history, then submits an alternative opening gate request through HF. It does not change the actual logbook, local save, recording or browser shelf. Refusal remains possible.
- The longer watch uses released HF `enableDoze` / `setDozeContext` and salient audible waking. The host resolves stopped work at `dozedAt`. It uses `estimateQuantity` only for real observations; character bias, poor light, fear and written-time slips stay host-authored. Unmarked runs keep the old workarounds.
- Dawn retains the actual HF review of the watch before the later morning review replaces it. A requested nap that actually began can supply the ordered cause to `reviewLine`. Narration does not erase the recorded lapse. Dawn omits an unqualified kept-watch claim when actual doze spans overlap the watch; the raw HF review remains unchanged.

Technical delivery and independent review receipts belong in the external games-deferred report. This source description is not owner acceptance or a playtest result.

## Public controls — 2026-10-27 candidate

Pace choices are public in native and file menus. New longer watches include joint handover, correction, covered hut rest and all implemented private scenes. Choosing five or twelve nights selects game length; no separate scene switch remains. Existing saved rules remain exact for current-version replay.

New native chapters carry matching people automatically through the public shelf contract. Loaded chapters keep their pinned people. Cast controls live on the central shelf, linked from the ending. File play stays memory-only and does not acquire people. Its dedicated chooser/download path preserves the local saved week; Debug does not offer the former in-place native-save importer. Debug starts collapsed beside Lab privacy.

This is an unreviewed source candidate. Source, live behavior and owner acceptance remain distinct.

## Deferred — owner and player input

- **Per-keeper bias readout (Priya): Adam, 2026-11-03.** Decide whether a numerical calibration would remove the information puzzle. The delivered comparison can use observed figures without exposing private bias.
- **Dai’s trough-only bias (Gwen): Adam, 2026-11-03.** Her original report said “half a metre low every time is not tiredness”. Current `biasOf` already grows with impaired clarity; it is not uniform. The narrower choice of a bias that grows only after three remains the owner’s decision.
- **Readiness and feel: Adam, 2026-11-03.** Keep the written-time retest (F-228), pacing/popovers/end tally (F-433/434), approved persistent desk (F-451/452), cast/receiving journey (F-465), recording linkage (F-491), plain English/setting/tablet reading (F-492/493) and current-build manifest behavior (F-496) as distinct owner/player checks. Their existing source receipts do not establish acceptance of this candidate.
- **Lab panel and same-tester retest: playtest director, 2026-11-03.** This builder runs no rounds. Friends and Show HN remain paused until Adam accepts readiness. Historical after-first-play dates no longer defer engineering under Widened.

Resolved historical source: F-228 preserves written slips as “read HH:MM (as written)”; radio arrivals use reported time; dawn can reconstruct actual read time. Keep those differences. The 2026-10-20 player reports remain verbatim in `docs/playtests/`.

## Owner pacing update (2026-10-21)

The desk uses automatic playback. New words, reports and flashes interrupt brisk time; an inspection waits for the player to close it or make a request. The information button opens native dismissible help with the existing sample report. The closing arithmetic is always computed and offered through “See tally” only at the end, without a start/menu preference. Simulation inputs, saves and replay rules are unchanged. Adam accepts feel.


## Owner speed restoration (2026-10-22)

The original speed choices are restored. Inspection, new-event reading time and menu protections remain. Simulation inputs, saves and replay rules are unchanged.

## Approved UI sweep (2026-10-22)

Adam approved the layout specification: "All good decisions, proceed." He added: "Good direction, proceed please, menu is fine. Just \"until something happens\" is too long, maybe Skip or Fast Forward or something else could be better."

The desk keeps its clock, keeper chips, scene and gauges visible while an inspection replaces only the radio log. Automatic pacing is the default. Slow / Steady / Fast live in the game menu. Skip ⏩ stops on the next delivered event or keeper status change and refuses to run during radio silence. The title shows a sample morning. Send word offers optional verdicts, a note and a remembered optional name. Saves, inputs and simulation rules remain unchanged.

Done means the approved UI is deployed with green exact-commit CI and a clean live release manifest, both requested viewport sizes have live acceptance evidence, the owner quotes are in the lab ledger, and the build report records delivery. Adam accepts the result after the owner retest.
