# Recruitment sessions: dependency graph

```
            ┌──────────── 01 S1 mockup (Opus) ──────────────┐
            │                    │ signed off               │ signed off
            │                    ▼                          ▼
 02 Foundation (Sonnet) ──► 03 S1 build ──► 04 S1 ship     05 S2 mockup (Opus)
            │                                  │              │
            │                                  └──────┬───────┘
            │                                         ▼
            │                                 06 S2 build ──► 07 S2 ship ──► 15 S4 ──► 16 S5 ──► 17 S6
            │                                         │                       └────────────────────▲
            ▼                                         │
 08 Exam engine + S3 mockup (Opus max)                │
      │            │             │                    │
      ▼            ▼             ▼                    │
 09 Bank      10 Runner     11 Master console         │
      │            │             │                    │
      │            ├─────────────┼────────────► 13 Scoring ◄──┘
      │            │             ▼                    │
      │            │        12 Live Coding            │
      ▼            ▼             ▼                    ▼
      └────────────┴─────► 14 S3 rehearsal + ship ◄───┘
```

## Can run at the same time
- **Today (23 Oct):** 01 and 02.
- **After 02:** 08 alongside 03, 04, 05 (08 doesn't touch S1 screens).
- **After 08:** 09, 10 and 11 together (owned paths split in EXAM-ENGINE section 10). Then 12 once 11 is done, and 13 once 10 and 06 are done.
- **15, 16, 17** are serial because each reuses the previous one's engines.

## Critical paths
- **Registration (25 Oct):** 02 → 03 → 04, with 01's sign-off needed before 03. If 01's sign-off slips, 03 builds the must-haves (banner, Daftar, read-only calendar) from the PRD and adopts the mockup rulings in 04.
- **Tes Tulis (16 Nov):** 02 → 08 → 11 → 12 → 14. Live Coding is the longest pole (the agent compile job + four protocols + hardware tests). If it slips, Phase 1 ships on time and Live Coding follows before the first evening's Phase 2 starts.

## Model choice
- **Opus:** decides and judges (mockups, the engine design, reviews, shipping).
- **Sonnet:** builds against a signed-off mockup and a written contract.

If a Sonnet session finds the contract wrong or missing, it stops and messages the Opus owner (or writes a `blocked` row) instead of redesigning.
