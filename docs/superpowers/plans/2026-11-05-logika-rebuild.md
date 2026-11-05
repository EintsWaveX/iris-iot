# Logika rebuild + answer styles per part: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this session builds it itself; the user did not ask for subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logika carry bank becomes 20 UTBK-PM-style + 20 IoT-module C questions, and each part (Logika, FITB, Kodingan) accepts only its own answer styles.

**Architecture:** One pure table `FORMATS_BY_PART` in `exam-types.ts` drives the server gate (`judgeSave`), the editor and the list filter. The carry bank is Markdown in `apps/web/scripts/rec-bank/01-logika.md`, checked by the existing gcc verifier plus a new sidecar that recomputes every PM answer independently of its key.

**Tech Stack:** TypeScript, React (Astro), vitest, Markdown seed bank, Python 3 + gcc for verification.

**Spec:** `docs/superpowers/specs/2026-11-05-logika-rebuild-design.md`

Work happens in the worktree `C:\Users\EintsWaveX\Documents\WebApps\iris-iot-logika` (branch `logika-rebuild`, off `origin/main` 73a77845). `apps/web` is the app root; every path below is relative to it unless it starts with `docs/`. No commits, pushes or deploys until the user asks (global rule); each task ends with a green checkpoint instead.

## Global Constraints

- Logika styles `single, multi, order, match`; FITB `fitb`; Kodingan `lines, fix`.
- 40 Logika carry questions: 20 PM, 20 module; module = 14 single, 2 multi, 2 order, 2 match; PM = 17 single, 3 multi. All `lang: c`, `sample: true`, `status: ready`.
- Module questions are plain C (`main`, `printf`), keeping module names and values (`SEND_INTERVAL 1000`, `counter`, `LORA_SPREADING_FACTOR 12`, `interval 60000`, `char message[50]`, `hello %d`, port `8765`). No `String`, `Serial`, library calls, function pointers, structs, bitwise, hex or shifts.
- PM questions are original (not copied from SNBT), one defensible answer, every number in the stem, no images, no tables.
- Copy: everyday Indonesian, tech words in English (array, input, output), casual; CaAs (never CaA). UI strings go in all three languages (id, en, zh) of `bankStrings.ts`.
- Every question title unique across the whole bank (the verifier is keyed by title).
- Heredocs with backslashes get mangled by the shell tool: write files with the Write tool.
- Do not touch `src/lib/db.ts` rig edits (the worktree is clean; leave it so). The user presses "Pasang Soal Bawaan" on prod; never do it.

## Review Focus

1. A legacy stored question whose style no longer fits its part: a save is refused with a clear message, but void and delete keep working (Task 1).
2. Changing a draft's part in the editor must reset an unfit style, not leave a Logika question on `fitb` (Task 2).
3. A file import mixing `fitb` into Logika (or `single` into FITB) must report one clear error per item in a dry run (Task 1).
4. PM options written the Indonesian way (`1,5`, `Rp1.300.000`, `25%`) must parse in the verifier, or a right key reads as wrong (Task 3).
5. Duplicate titles or a PM item with two defensible options would pass the key check but be unfair (Tasks 3 and 5).

---

### Task 1: The part-to-style rule in the validator and API

**Files:**
- Modify: `src/lib/recruitment/exam-types.ts` (next to `FORMATS`, line 22)
- Modify: `src/lib/recruitment/bank-rules.ts` (`judgeSave`, line 307)
- Modify: `src/lib/recruitment/types.ts` (the error-code union near `"bahasa_salah"`, line 335)
- Modify: `api/_lib/recruitment-bank.ts` (`STATUS`, line 98)
- Modify: `src/components/recruitment/panel/tes/bank/bankStrings.ts` (the `err` blocks at lines 281, 652, 1016 and the `IMPORT_ID` blocks at lines 1226, 1242, 1258)
- Test: `src/lib/__tests__/recruitment-bank-rules.test.ts`, `src/lib/__tests__/recruitment-bank-io.test.ts`

**Interfaces:**
- Produces: `FORMATS_BY_PART: Record<Phase1Part, readonly Format[]>` and `formatsOf(part: Phase1Part): readonly Format[]` in `exam-types.ts`; error code `"format_bukan_bagian"` (HTTP 400) returned by `judgeSave`.

- [ ] **Step 1: Write failing tests** in `recruitment-bank-rules.test.ts`, inside `describe("judgeSave")`:
  - `"a part takes only its own answer styles"`: `judgeSave(null, {...base, part:"logika", format:"fitb"} , ctx())` equals `{ok:false, kode:"format_bukan_bagian"}`; same for `part:"fitb", format:"single"`, `part:"kodingan", format:"order"`; and `{ok:true, kind:"create"}` for `logika/match`, `fitb/fitb`, `kodingan/fix` (use the file's existing `stateOf`/`single` helpers; bodies are not read by `judgeSave`).
  - `"a stored question with a wrong style is refused on save, even unchanged"`: `judgeSave(stored({...base, part:"fitb", format:"single"}), same, ctx())` is `format_bukan_bagian`.
  - `"formatsOf lists every format once across the parts"`: the three lists together equal `FORMATS`, with no format in two parts.
  In `recruitment-bank-io.test.ts` add `"every carry question fits its part"`: parse `SEED_MD` (import as `recruitment-bank-draft.test.ts` does) and expect each draft's `format` to be in `formatsOf(draft.part)`.
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/recruitment-bank-rules.test.ts src/lib/__tests__/recruitment-bank-io.test.ts`. Expected: FAIL (`formatsOf` / `format_bukan_bagian` not defined).
- [ ] **Step 3: Implement** `FORMATS_BY_PART` (logika `single, multi, order, match`; fitb `fitb`; kodingan `lines, fix`) and `formatsOf` in `exam-types.ts`. In `judgeSave`, right after the language check, return `{ ok:false, kode:"format_bukan_bagian" }` when `!formatsOf(next.part).includes(next.format)`. Add the code to the union in `types.ts` and `format_bukan_bagian: 400` to `STATUS`.
- [ ] **Step 4: Add wording** in all three languages, both for `err` (editor toast) and `IMPORT_ID` (importer): id `"Bagian ini tidak memakai format itu."`, en `"This part does not use that format."`, zh `"这个分类不使用该题型。"`. Confirm a type error appears if any of the six places is missed (`npx tsc --noEmit -p tsconfig.json`).
- [ ] **Step 5: Run** the two test files again. Expected: PASS. The `SEED_MD` test passes already (current seeds fit); it guards the new bank.
- [ ] **Step 6: Checkpoint** `npx vitest run src/lib/__tests__` and `npx tsc --noEmit -p tsconfig.json`: no new failures.

### Task 2: Editor, draft and list follow the rule

**Files:**
- Modify: `src/lib/recruitment/bank-draft.ts` (next to `changeFormat`, line 138)
- Modify: `src/components/recruitment/panel/tes/bank/BankEditor.tsx` (new-draft default line 151, `FormatPick` line 293, part dropdown line 468)
- Modify: `src/components/recruitment/panel/tes/bank/BankList.tsx` (format filter, line 120)
- Test: `src/lib/__tests__/recruitment-bank-draft.test.ts`

**Interfaces:**
- Consumes: `formatsOf` (Task 1), `changeFormat`, `blankDraft`.
- Produces: `changePart(d: Draft, part: Phase1Part, langs: readonly Lang[]): Draft` in `bank-draft.ts`: sets `part`; keeps `lang` when listed in `langs` else `langs[0]`; when `d.format` is not in `formatsOf(part)` returns it through `changeFormat(..., formatsOf(part)[0])` (prompt and images kept, key reset).

- [ ] **Step 1: Write failing tests** in `recruitment-bank-draft.test.ts`: `"changePart keeps a style the new part takes"` (logika `multi` to... any part that takes it is only logika, so use logika to logika: same draft returned); `"changePart moves a logika single to fitb as an empty fitb keeping the prompt"` (format `fitb`, `body.prompt` kept, `answer` is `{ blanks: {} }`); `"changePart moves a fitb to kodingan as lines"`; `"blankDraft for each part starts on that part's first style when asked"` is not needed (the editor passes it).
- [ ] **Step 2: Run** that file. Expected: FAIL (`changePart` not exported).
- [ ] **Step 3: Implement `changePart`** as specified above.
- [ ] **Step 4: Wire the editor.** New draft: `blankDraft(part, langs[0], formatsOf(part)[0])`. `FormatPick` maps over `formatsOf(d.part)` instead of `FORMATS`. Part dropdown `onChange` calls `set(changePart(d, part2, allowedLangs(config.config, part2)))` and clears the preview value the way the format radio does (`setValue(null)`). With one style (FITB) still render the radio so the screen shape stays the same.
- [ ] **Step 5: Wire the list filter.** Offer `formatsOf(part)` in the dropdown; reset `f` to `"semua"` when the part changes (the pager already resets on `[part, f, q]`).
- [ ] **Step 6: Run** the draft tests plus `npx tsc --noEmit -p tsconfig.json`. Expected: PASS, no type errors.
- [ ] **Step 7: Browser check** (low RAM here: use one page): start the app per `README.md`, sign in as Panitia in the practice edition, open Bank per part: Logika shows four styles, FITB one, Kodingan two; switch a draft's part and confirm the style resets. Report honestly if it cannot be run.

### Task 3: Verifier support for PM questions

**Files:**
- Create: `scripts/rec_bank_pm.py` (the PM recomputations)
- Modify: `scripts/rec-bank-verify.py` (`main`, `HANDLERS`)
- Test: `scripts/rec_bank_pm.py` self-test run as `python scripts/rec_bank_pm.py --selftest`

**Interfaces:**
- Produces in `rec_bank_pm.py`: `PM: dict[str, dict]` keyed by question title, each value either `{"single": <number or str>}` (the independently computed right answer) or `{"multi": {<option text>: <bool>}}`; `parse_num(text: str) -> float | None` reading Indonesian forms (`1,5`, `Rp1.300.000`, `25%`, `3 jam`, `2,25 jam`, `1 jam 15 menit` is not parsed and must be matched as a string).
- Consumes: the parsed bank JSON `rec-bank-verify.py` already builds (`q["title"]`, `q["body"]["options"]`, `q["answer"]["correct"]`).

- [ ] **Step 1: Write the self-test first** in `rec_bank_pm.py` under `--selftest`: asserts `parse_num("1,5")==1.5`, `parse_num("Rp1.300.000")==1300000`, `parse_num("25%")==25`, `parse_num("2,25 jam")==2.25`, `parse_num("tidak ada")` is `None`.
- [ ] **Step 2: Run** `python scripts/rec_bank_pm.py --selftest`. Expected: FAIL (`parse_num` missing).
- [ ] **Step 3: Implement `parse_num`**, an empty `PM = {}`, and the selftest runner.
- [ ] **Step 4: Add `check_pm(q)`** to `rec-bank-verify.py` and route to it in `main` when `q["part"] == "logika"` and the prompt has no ```` ```c ```` fence. Behaviour: title missing from `PM` is a failure (`"add PM check for this title"`); `single`: the option equal to the computed value (numeric compare through `parse_num`, else normalised string compare) must be exactly one option and must be the key; `multi`: the computed truth map must equal the key set, and every option must be in the map. Record each with the file's `rec(...)`.
- [ ] **Step 5: Run** `python scripts/rec-bank-verify.py --only Prima` (any existing title). Expected: its existing checks still pass; no PM title yet.
- [ ] **Step 6: Checkpoint** the selftest passes and `python scripts/rec-bank-verify.py` still reports the same count as before this task with no new FAIL (the current Logika seeds still run through the old path).

### Task 4: The 20 module questions (plain C)

**Files:**
- Modify: `scripts/rec-bank/01-logika.md` (replace the 36 old entries; this task writes the 20 module entries, Task 5 appends the 20 PM)
- Modify: `scripts/rec-bank-verify.py` (`CLAIMS` entries for the two multi questions, `EXPECT` only if a prompt cannot show its output)

**Interfaces:**
- Consumes: the entry format in `scripts/rec-bank/00-contoh.md` (front matter `part, lang, format, title, sample, status`, then prompt, then the key block per format) and the topic list under "Module question topics" in the spec.

- [ ] **Step 1: Read** `00-contoh.md` once for the exact key syntax of `single`, `multi`, `order` and `match`, and `main_id.typ` lines 1752-1930 and 2775-3260 for the values to reuse.
- [ ] **Step 2: Write the 14 single questions** (spec topics 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14 and 16). Each: a short plain-C program with module names and numbers, "Berapa output program ini?" style prompt, four options, one right, wrong options are plausible slips (off by one, forgot the fall-through, wrong order of `++`). Titles unique and not already used in `02-fitb.md`/`03-kodingan.md`.
- [ ] **Step 3: Write the two multi** (topics 7 and 18) with `CLAIMS` rows: each statement is a C expression true or false after the code, as the existing `CLAIMS` rows do.
- [ ] **Step 4: Write the two order** (topics 17 and 20) with the key order and every other order that is also right under `also`; the verifier compiles each.
- [ ] **Step 5: Write the two match** (topics 15 and 19) with left sides that are plain C expressions in backticks, so the verifier evaluates them.
- [ ] **Step 6: Verify** `python scripts/rec-bank-verify.py --only` for each new title in turn (or run all). Expected: every module question has all its checks ok. Also compile each single's program with `gcc -std=c11 -Wall -Wextra` and fix any warning.
- [ ] **Step 7: Parse check** `npx vitest run src/lib/__tests__/recruitment-bank-io.test.ts src/lib/__tests__/recruitment-bank-draft.test.ts`. Expected: PASS (the seed test from Task 1 now sees the new entries).

### Task 5: The 20 PM questions

**Files:**
- Modify: `scripts/rec-bank/01-logika.md` (append 20 entries)
- Modify: `scripts/rec_bank_pm.py` (one `PM[...]` entry per title)

**Interfaces:**
- Consumes: `PM` and `check_pm` (Task 3), the topic list under "PM question topics" in the spec.

- [ ] **Step 1: Draft each question and its `PM` entry together**, in this order: a short Indonesian story with units, one quantity asked, a `Catatan` line only when rounding matters, four options for a single and four or five statements for a multi; the `PM` entry computes the answer from the stem's numbers in Python (not from the key). Difficulty: about 8 easy, 8 medium, 4 harder.
- [ ] **Step 2: Cover the topics**: percent change and discount; profit and loss; progressive tax (as a text list); average with a missing value; arithmetic series; seat or tile pattern; ratio and map scale; speed-distance-time; combined work; Venn counting; empirical probability from a small list; linear equations from weighings; simple inequality; composite area; volume and unit conversion; cheapest shipping combination; and three multi-select items (statements about a list of numbers, about a pattern, "which is always true").
- [ ] **Step 3: Distractors** are the natural slips (percent of the wrong base, forgot a step, unit not converted). For each question state, in a short comment-free check, that no distractor is also right: `check_pm` already fails when two options equal the computed value.
- [ ] **Step 4: Verify** `python scripts/rec-bank-verify.py`. Expected: all 40 Logika questions pass, plus FITB and Kodingan unchanged, 0 FAIL.
- [ ] **Step 5: Read every PM stem once** for ambiguity and for Indonesian that is plain and casual; fix wording (not numbers) where needed, and re-run Step 4.
- [ ] **Step 6: Counts check**: `grep -c '^part: logika' scripts/rec-bank/01-logika.md` is 40; formats are 31 single, 5 multi, 2 order, 2 match (module 14/2/2/2 + PM 17/3).

### Task 6: Whole-branch verification and hand-off

**Files:**
- Modify: none (read-only checks), unless a check fails.

- [ ] **Step 1: Full checks** from `apps/web`: `npx vitest run`, `npx tsc --noEmit -p tsconfig.json`, `npx eslint .` on the changed files, `python scripts/rec-bank-verify.py`, `python scripts/rec_bank_pm.py --selftest`. Expected: all green; if a failure is not from this work (stale env, missing gcc), say so with the output.
- [ ] **Step 2: Prod read-only check** (psql with `apps/web/.vercel/.env.production.local`, as in the user's memory note): count questions whose `(part, format)` is not in `formatsOf`. Report the number and ids; change nothing.
- [ ] **Step 3: Seed swap dry look**: confirm from `api/_lib/recruitment-bank.ts` `pasangBawaanKe` that untouched Logika seeds are replaced and removed ones deleted, with no migration needed.
- [ ] **Step 4: Report** to the user: what changed, counts, what was and was not run, the prod count from Step 2, and that they need to press "Pasang Soal Bawaan" in both editions after deploy. Offer to commit, push and open the PR; do not do it unasked.
