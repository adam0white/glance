# HF 4.14 migration

Target: published HF 4.14.0, client 0.5.13 and kit 0.5.30. The client embeds exactly HF 4.14.0; the kit peers with that client. These replace the provisional 4.13 companion pins in PR #12.

The published CHANGELOG was read from the current4.8.0 pin through4.14.0, including4.8.1. History inspection now calls `readRunHistory` rather than treating the encoded pool as an array. Journal recovery uses public HF constructors and verifies the complete host replay. A single localStorage write commits the matching host snapshot, opening, complete chunk and head atomically. This uses a fresh standalone journal each time; incremental cursor writes are a later optimization and no cursor is persisted. Complete native exports remain the download, recording and file-play authority.

Live readings come from public current inspections. The normal keeper inspection shows broad words for outward condition, mood, feelings, pressing needs and learned outcomes. It displays no HF quantities. It labels private feelings as game readings rather than radio evidence. It never claims gauge accuracy or reveals water truth. Inspection does not draw randomness or change the Run.

All keeper suggestion replies use HF's single event-time phrasebook renderer. The game supplies complete verdict sentences, reasons and per-person wording. Deferrals without a winning action use the slot-free later key. The host no longer chooses a verdict line by array index, guesses an exhaustion cause, or rewrites an HF review into a confession. Physical doze intervals remain actual game evidence. The engine owns its selected wording and replay. No newborn or retelling input is used by Glance.

The new game edition refuses older saves plainly. Historical fixture bytes and their replay hashes are retained unchanged. Current deterministic replay also has an exact seed7 hash; HANDOFF records its engine identity. No physics, difficulty or actor RNG tuning is part of this migration.

The coordinator waived hosted review at2026-10-29T09:25Z. This one PR uses that waiver and requests no additional review. Adam's feel/readiness acceptance remains separate from technical delivery.

HF 4.14 adds `forkRun` for admitted live runs. Glance does not branch a live Run, so no new fork path is needed. Untrusted files still use full restore and replay validation. The 4.14 engine identity requires a fresh run; older saves refuse before replacement. No faculty, physics or authored person changes are introduced by 4.14.
