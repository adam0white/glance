# Playtest: HF characters, 2026-10-19

The human-framework repo's HF-character playtester (`packages/playtester`, at HF commit e32850e, HF 2.8.0) played The Glance headless through `scripts/playtester/hf-session.ts`. Each of its four presets is an HF person who plays through observe/actions/apply/advance and gets bored, frustrated or stops. The game ran at commit 8e870e7 (HF 2.8.0), two seeds each.

The adapter is mine, so read the result with that in mind. It shows what the screen shows: new log lines, dawn results and each keeper's telegraphed answer. Its gate choice comes from the reported level alone, so these players trust the board. It does not correct for Dai reading low. That is the naive play the game exists to punish.

## What it showed

- Players who trust the board lose the dam on Tuesday or Wednesday. Every unwinder and completionist run ended in an overtop on night 2 or 3. That is the intended lesson. The human playtesters show whether it lands as a lesson or as unfair.
- The longest lulls fall in the quiet stretch of Monday after the first readings: 33 to 105 seconds from about 23:44, and 84 seconds on Tuesday from 02:31. The restless preset put the game down once in that stretch. This matches the owner's Night Watch complaint and Jade's report.
- Frustration comes from refusals in the small hours ("Not yet. I’ve nothing left in me. Twenty minutes.", "I… I can’t, sir. Sorry. I need a minute."). The players read these as obstacles, not as information.
- `rewarded 0x` in every run. My adapter's events probably do not reach the harness's reward threshold (a valence of 0.15 for a report). I have not confirmed this, so treat it as an adapter question, not a finding.

## Output (verbatim)

```

commuter seed 1: agenda after 7 min at N2 23:47 (commitment:c1)
  nights ok/d; engagement 0.67; time {"input":0.14,"watch":0.86}
  longest lull 45s from N1 00:52 (watch); looked away 0x
  7:00 N2 23:47 stopped: had to stop (commitment:c1)
  rewarded 0x, first: 

commuter seed 2: agenda after 8 min at N2 01:11 (commitment:c1)
  nights ok/d; engagement 0.65; time {"watch":0.81,"input":0.19}
  longest lull 51s from N1 00:35 (watch); looked away 0x
  8:00 N2 01:11 stopped: had to stop (commitment:c1)
  rewarded 0x, first: 

unwinder seed 1: game-over after 10.5 min at N2 06:00 (the game ended)
  nights ok/d X/d; engagement 0.7; time {"input":0.23,"watch":0.77}
  longest lull 33s from N1 01:08 (watch); looked away 0x
  10:12 N2 04:16 frustrated: dai: Not yet. I’ve nothing left in me. Twenty minutes.
  10:27 N2 06:00 finished: the game ended
  rewarded 0x, first: 

unwinder seed 2: game-over after 16.4 min at N3 06:00 (the game ended)
  nights ok/d ok/d X/d; engagement 0.64; time {"watch":0.69,"input":0.31}
  longest lull 84s from N2 02:31 (watch); looked away 0x
  10:42 N2 04:58 frustrated: dai: I can’t. Arms are gone. Give me twenty.
  16:24 N3 06:00 finished: the game ended
  rewarded 0x, first: 

completionist seed 1: game-over after 10.5 min at N2 06:00 (the game ended)
  nights ok/d X/d; engagement 0.72; time {"input":0.23,"watch":0.77}
  longest lull 18s from N1 01:29 (watch); looked away 0x
  10:27 N2 06:00 finished: the game ended
  rewarded 0x, first: 

completionist seed 2: game-over after 16.4 min at N3 06:00 (the game ended)
  nights ok/d ok/d X/d; engagement 0.68; time {"watch":0.68,"input":0.32}
  longest lull 57s from N2 03:09 (watch); looked away 0x
  14:21 N3 02:05 frustrated: callum: I… I can’t, sir. Sorry. I need a minute.
  16:24 N3 06:00 finished: the game ended
  rewarded 0x, first: 

restless seed 1: game-over after 10.5 min at N2 06:00 (the game ended)
  nights ok/d X/d; engagement 0.57; time {"input":0.28,"watch":0.72}
  longest lull 102s from N1 23:44 (watch); looked away 0x
  10:00 N2 03:59 frustrated: dai: Not yet. I’ve nothing left in me. Twenty minutes.
  10:27 N2 06:00 finished: the game ended
  rewarded 0x, first: 

restless seed 2: quit after 9 min at N2 02:35 (emotion:joy:novel)
  nights ok/d; engagement 0.52; time {"watch":0.78,"input":0.22}
  longest lull 105s from N1 23:44 (watch); looked away 0x
  9:00 N2 02:35 stopped: put it down (emotion:joy:novel)
  rewarded 0x, first: 
```
