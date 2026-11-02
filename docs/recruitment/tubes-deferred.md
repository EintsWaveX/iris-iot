# Tubes: flagged for a later patch

Decided 3 Nov 2026: everything about Tubes waits. Nothing below is built, and none of it blocks the other stages.
Tubes is also exempt from the exact-match rule against the mockup until it is picked up again.

| Item | State |
|---|---|
| Penerimaan: a Tubes score column (per member, from the team's Tubes assessment) | Not built. Needs a rule for whose score counts for each member, since Tubes is graded per team. |
| Tubes presentation sheet, Catatan step (`TubesParts.tsx`, shared answers `_catatan` and `_q:<id>`) | PR #18, draft. Never clicked through with a real team. Check that `tubes-board` copes with a slot whose leader has no team before merging. |
| Tubes tab, Penilaian and Template | Moved toward the mockup on 2 Nov, never compared after that. They use the stage-aware Penilaian and the Baris Rubrik template; the mockup has its own wording. |
| CaAs page for Tubes (mock shot `r5-caas`) | Not compared. |
| Rig seeds for a Tubes evening | `parity/seed_tb2.mjs`, `seed_tb3.mjs`. Hand-seeded slots without a team made the Tubes tab hang on its skeleton. |
| Branch `arduino-cut` | Still needs a rebase. |

Other decisions from 3 Nov, for the record:

- "Buka Ulang Bagian Terakhir" on a finished Tes Tulis room is **not built, on purpose**. A makeup room covers the case. Reopening would need a finished-to-running transition, new MQTT accounts, and a rule for stored answers.
- The Tampilan menu keeps Jam di navigasi and Suara. Tambah CaAs keeps prodi, MK IoT and Praktikum IoT (the Google Form answers the validator requires).
- Cross-stage clash flags in the Plotting Papan already shipped in PR #26 (every stage shares `rec_slot`).
