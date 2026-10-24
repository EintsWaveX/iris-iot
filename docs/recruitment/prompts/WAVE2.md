# Wave 2 · shared notes (2026-10-24 11:55 WIB)

Read this after `_RULES.md` and before your own prompt. It replaces `WAVE1.md` where they differ. Three sessions run at once in wave 2 (user, 2026-10-24: separate prompt sessions, no subagents):

| Session | Prompt | Model / effort | Deadline |
|---|---|---|---|
| W1 | `W1-ship-test-review.md`: the deploy, the prod test application, reviewing 08, then reviewing everything that follows | Opus 5.5, high | deploy and test application before **Sat 24 Oct 18:00 WIB** |
| 08c | `08c-s3-mockup.md`: the S3 Stage 0 mockup, split out of 08 | Opus 5.5, high | signed off by **Mon 26 Oct** |
| 06 | `06-s2-build.md`: the S2 build | Sonnet 5.5, high | live by **Mon 9 Nov** |

Put your session name in your STATUS.md row when you claim it, so the other two can find you with ListAgents and SendMessage. Talk to each other directly; the user should not have to relay anything.

## Where things stand
- **S1 is live** on irisiotlab.com (main `c251ddc` and later). Prod schema is at **0048**; the next free migration is **0049** and belongs to 06. 11 generates 0050 after it (EXAM-ENGINE 10.1).
- **05 is done and signed off** (v4 of https://claude.ai/artifact/RCXL2f8vcpWhQHhorCeAPz). Its docs are uncommitted: `PRD.md`, `ARCHITECTURE.md`, prompts 05, 06, 11, 15, `DEPENDENCIES.md`, `STATUS.md`, `handoffs/05.md`.
- **08 is done** for Parts A and B: `EXAM-ENGINE.md` reviewed with the user, the pure modules in `eb3078f` on the branch (not pushed; nothing imports them yet). `handoffs/08.md`, `08c-s3-mockup.md` and this file are uncommitted. Part C is now 08c.
- **The back button `e2bfedf` is already on main**; WAVE1.md's "one undeployed commit" is out of date.
- **The branch no longer fast-forwards onto main.** `phase9-global-and-asisten` carries `e839229`, which reached main as the cherry-pick `d508f03`, and `354aed9` (a Kode Jurnal file may have no blanks), which was held back so as not to deploy during a live Module 2 session. Ship by cherry-pick from a temporary worktree onto origin/main (`_RULES.md`, Repo and git). Ask the user whether `354aed9` goes in this deploy; never deploy while a practicum session is running.

## Rulings that bind wave 2
- **At most three sessions at once**, one Playwright script at a time, small page counts, browsers closed. The rig is shared (06 and W1 use it; 08c only needs the mockup tools and Chromium).
- **The wave 1 deploy can go now** (on the user's go, as always): 05 is signed off, 08's shippable work is committed, and 08c's mockup ships nothing. Commit the uncommitted docs listed above first, with explicit paths.
- **Nothing outside the Panitia sees recruitment before Sun 25 Oct 00:00 WIB.** The prod test application must not open the daftar gate (W1 section 4).
- The user's 2026-10-24 answers for the exam are in `EXAM-ENGINE.md` 11.2: one or two boards per seat (DevKit V1 and S3 in any mix), phone hotspots per room, every default I wrote ships and stays editable, the exam's MQTT on broker.irisiotlab.com.

## After wave 2
- **Wave 3** starts when 08c is signed off: 09, 10 and 11 (Sonnet 5.5 high), at most three at once, so it waits for 06 or runs beside it with only two of them. W1 gives the user the kickoff lines.
- Then 12 (after 11), 13 (after 10 and 06), 07 (W1 reviews and ships 06), and 14.

## Kickoff (what the user sends)
Open a new Claude Code session in `C:\Users\EintsWaveX\Documents\WebApps\iris-iot`, set the model and effort, then send:
> Run `docs/recruitment/prompts/<file>`. Read `docs/recruitment/prompts/_RULES.md` and `docs/recruitment/prompts/WAVE2.md` first.
