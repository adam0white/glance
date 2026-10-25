# Plain English

Write full sentences with articles and verbs. Short button labels and measured values may be labels.
Say literally what happens. Use one name for each thing. Explain a game term when it first appears.
Introduce one new idea at a time. Use familiar words for instructions and UI; aim for grade 7 reading, without claiming a measured grade.
Dialogue may be richer, but it must be grammatical. Preserve names, uncertainty, rules and difficulty.
Describe approximate state clearly. Cut words the player does not need.

Rewrite player text where it is written, including simulation dialogue. Do not add display lookup tables. Keep current-version exports deterministic. Older files may be refused with a plain message telling the player to start a new game. Never turn an uncertain report into hidden truth. Never correct a keeper’s written time from the simulation clock.

## Setting and language (owner, 2026-10-24)

Keep the setting, places and personal names. Every sentence must be understandable without Turkish. Use English for common nouns. On first use, call the kapıcı “the building’s caretaker”; later use “caretaker”. Keep at most two flavour words per game. Explain each within its sentence on first use. Faith stays quiet background. Source faith wording from the central Human Framework `research/` directory; do not invent rulings. Change no meaning, rules or difficulty. Keep semantic HF activity IDs unchanged. Host-authored activity labels are prose and may be rewritten. Narration templates from the HF package are handled there.

## Completion and acceptance

This pass ends with source rewrites, a comparison of seeded full runs with only known prose fields blanked, current-export replay checks, a ten-minute browser text dump, phone and desktop layout checks, one independent Codex review, a signed commit, green CI on that commit, and a deployed `/release.json` with that commit and `dirty:false`. The evidence is in `~/code/.lab-scratch/plain2/glance-report.md`. The owner accepts the reading quality after playing it; the next scheduled owner review is 2026-11-03.

## HF adoption lesson (2026-10-25)

Pin the published framework and any nested framework dependency to exactly 2.21.0.
The package and engine versions are both 2.21.0 in this release.
Set `lexicon: { plainEnglish: true }` when creating each original person.
A new chapter admits histories into that opening person and saves the admitted state.
Loading a run must replay its pinned chapter without changing its narration choice.
Refuse an incompatible export with a message that tells the player to start a new game.

An HF narration upgrade also changes text inside decision traces and episode summaries.
For a state comparison, blank only named presentation fields.
Keep episode IDs, actions, times, ordering, tags, recall data, history and `usedLines`.
Map changed episode sentences only through exact, activity-preserving aliases.
Check for alias collisions before comparing hashes.
Never erase a whole history to make an upgrade pass.
Retain host wording that identifies the keeper or explains dam work.
The adoption evidence is in `~/code/.lab-scratch/hfadopt/glance-report.md`.
