# The Glance: design

**One line.** A storm week on the night desk at the river authority. Up the valley, one old dam above a town, and on it a keeper with a torch and a radio. Every number on your board is what a tired man saw.

**Done for the first playable** (set 2026-10-19 by the coordinator's brief; the owner accepts feel separately): five playable nights with one new pressure each, a dawn logbook that draws the truth over the reports, an ending, a playtest export that replays, tests, a headless measure, a polish round with at least three source-unread playtesters recorded verbatim, live at https://glance.adamwhite.work.

## How it was chosen (2026-10-19)

Concept #1 of `human-framework/docs/game-taste-2026-10-19.md`, the owner's own idea: "the trusty HUD is all relative to how good their character is". Two consultants read only a brief (three settings, three loop shapes, the owner's taste and the lessons of The Night Watch, The Pass and The Rope), no source.

- **Game-design expert (Opus)** picked the dam and the rounds loop: "The dam fails in two directions you can name … every action is physical work for a person you can hear getting tired." Sending the keeper to read is a real decision because it costs his walking time, his tiredness and his absence from the gate wheel. A pure glance budget is "an abstract UI tax". Key rules: the river answers a release about 40 minutes later, so decisions are always in flight; confidence lives in the keeper's words (his perceived state), accuracy leaks only through tells drawn from his true state; the water balance lets a careful player catch a wrong reading in the moment; never 40 seconds without a voice. Cut: a simulated town. The town is one voice, one bridge and the houses on the dawn page.
- **Wildcard (Sonnet), Gwen, 61, thirty years a reservoir keeper in mid-Wales, plays on her phone between school-bus runs:** "A game that admits the gauge is only a man's say-so." What keepers really do when tired: round down, "because down is what they want"; report the same number twice "because they didn't go and look"; skip the far walk and say they did; "stop mentioning things, because they've stopped noticing. Silence is the warning." Gates stick, and "gate's moved" is not "gate's moved as far as I said". Phone-down list: a tutorial that tells her gauges can be wrong, lessons on human error, film dialogue, glowing needles, a rushing timer, stars before the night ends, a red lose screen, sad music. What brings her back: the dawn logbook, "finding he was reading low by his fourth hour, and thinking 'I should have known from how he wrote his sevens'", and a keeper who remembers being pushed. Wild idea, taken: ring someone with no gauge at all, the pub by the bridge, "a cross-check made of gossip". Her keepers, taken: **Dai Pritchard, 63**, thirty-one years on the dam, "I'm grand", reads confidently and low; **Callum, 24**, agency, second week, reads high because he is frightened of missing it, "will do anything you say, which is the trouble".

## Core loop (settled)

1. **Read the board.** Four gauges, each holding the last reported value in crisp print, with the time it was taken. The ink fades as the report ages. The board always looks exact.
2. **Ask.** Tap a gauge or a job to radio the keeper. He walks there on the small map (time and tiredness), reads, and says it in his own words. Tap asks; press and hold insists.
3. **Weigh the man.** His confidence is in his words ("bang on", "near enough", "call it four-two") and comes from how he feels (HF perceived state). His accuracy comes from how he is (HF true state, circadian alertness, fatigue store, fear). Tells, never numbers: the same figure twice, a walk too short to have reached the weir, a yawn mid-number, a wrong time, loose handwriting.
4. **Decide.** Turn the spillway gate open or shut (the keeper's arms do it; he forecasts what it costs him through HF `bodyForecast`), let him rest, ring the inn by the bridge, warn the town.
5. **The river answers later.** The reservoir rises with rain that fell an hour ago; the bridge rises about forty minutes after a release. A lightning flash shows the true level for an instant. At dawn the logbook draws the true curve in red over his pencil dots, with the reason for each big miss.

Between crises the player plans his next walk ahead of the rain, trades his rest against fresh readings, and checks his figures against the water balance and the inn.

## The week (one new pressure a night, brought by a person or the weather)

| Night | New pressure |
|---|---|
| Monday | Dai alone. The level, the gate, rain. Learn that he reads low. |
| Tuesday | The weir upstream and the Bridge Inn: Nerys at the window, and the town warning. False alarms cost her goodwill. |
| Wednesday | Callum arrives. Two keepers: who walks, who sleeps. He never says no. |
| Thursday | The radio drops in the wind; a tree comes down on the screen. Silence is the warning. |
| Friday | The crest. Everything at once; the 1979 mark on the wall. |

The dam overtopping ends the week (the dawn page still comes). Achievement is the dawn overlay: your gate marks bracketing the true curve though his dots were off. "You read the man, not the gauge."

## Rules taken from the consults
1. A night is 22:00 to 06:00. Playback runs automatically: brisk quiet work, reading time for new radio words, and time held during an inspection or information popover. Each simulation minute still runs; the first new event ends a fast batch. There is no speed chooser.
2. No meter for a person. State shows in words, handwriting, gait on the map and the dawn notes.
3. Every error has a cause in the keeper's true state and a tell the player could have read; the dawn page names the cause.
4. World randomness is keyed by seed, night and minute (pattern from The Pass), so one input never moves the storm.
5. Insisting gets compliance under protest and costs trust; it comes back in the dawn line and in later answers.
6. The town is not simulated: one voice, one bridge, a row of houses on the dawn page.

## The world (host side, `src/sim`)
- **Water.** Rain falls through a catchment (a linear store, about an hour's lag, wetter ground runs off more) into the reservoir; the gate releases by its opening and the head; above the crest the dam overtops. The bridge rises with the release (about forty minutes' lag) and with the town's own runoff.
- **Readings.** The keeper's read is the truth plus an error whose size grows as his true clarity falls and whose bias is his character (Dai low, Callum high, more so when afraid). His spoken confidence is computed the same way from his perceived state. Skipped walks and copied figures are host rolls from true sleepiness, keyed by the minute.
- **Noticing.** At the dam the keeper perceives what is there (the rain, the gate, a tree on the screen) through HF `perceive`, whose limited attention narrows with fatigue and fear. He mentions only what got through.

## Deferred (target: after the owner's first playtest)
- Standing orders for the radio drop-outs ("if it passes four-five, give her a turn").
- A second week, other dams, a recruited third keeper.
- Keep both readings on the board when two keepers disagree (Tomás, Priya). The gauge now shows the previous figure and who read it; a fuller side-by-side is the target for the owner's first playtest.
- Flag a reading as doubted and have the dawn score it (Tomás). Target: owner's first playtest.
- Carry the water level and the keepers' tiredness from one night to the next (Tomás). Target: second week.
- A per-keeper bias readout beyond the margin note (Priya). Target: second week; it may undercut the core loop, so decide with the owner.
- A weather forecast and a what-if replay of the night (Priya). Target: second week.
- Doze hazard and quantity estimates from HF (docs/hf-requests.md items 2 and 3). Target: HF engine 2.10.
- Dai's low bias is uniform before three as well as after (Gwen: "half a metre low every time is not tiredness"). Decide with the owner whether it should grow only in the trough. Target: owner's first playtest.
- Resolved 2026-10-20 (F-228): written reading times retain the keeper's slips, labeled “read HH:MM (as written)” across the live board, drawing and sheets. Reading ages use that same written time. Radio arrivals say “reported HH:MM”; dawn explicitly reconstructs actual reading times. Simulation and export replay are unchanged. Owner accepts feel separately.

## Owner pacing update (2026-10-21)
The desk uses automatic playback. New words, reports and flashes interrupt brisk time; an inspection waits for the player to close it or make a request. The information button opens native dismissible help with the existing sample report. The closing arithmetic is always computed and offered through “See tally” only at the end, without a start/menu preference. Simulation inputs, saves and replay rules are unchanged. Adam accepts feel.
