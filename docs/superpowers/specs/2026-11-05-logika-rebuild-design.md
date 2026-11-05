# Logika rebuild + answer styles locked per part

Date: 5 Nov 2026. Status: approved in chat by the user (scope, split, per-part styles). Not yet committed.

## Why

Logika today is 36 generic "what does this C print" questions with nothing from the lab's own
material. The user wants Logika to measure two things the lab cares about for Asisten candidates:
(a) can they read the kind of C that appears in the IRIS IoT module, and (b) can they reason
with numbers the way the UTBK SNBT Penalaran Matematika (PM) subtest asks. Separately, the
question editor lets any part use any answer style, so FITB can get a multiple-choice question
and Logika can get a fill-in-the-blank one. FITB is already its own part in the carry-question
files (`02-fitb.md`, 39 questions, all format `fitb`); the app just does not enforce it.

## Goals

1. Logika carry bank = **40 questions, 20 PM-style + 20 IoT-module C questions.**
2. Each part only accepts its own answer styles (editor, save API, file import).
3. Every key is machine-checked; a wrong key is the worst outcome (one source we read had four
   wrong keys out of ten).

## Non-goals

- No change to FITB or Kodingan questions, the exam runner, scoring, Mode Latihan wiring, the
  bonus quota, or `shown`/`pool` numbers (pool is already 40 per part).
- No Arduino-only syntax in questions (`String`, `Serial`, library calls). Candidates cannot
  compile or look anything up.
- No bitwise operators, hex or shifts (candidates do not know them; removed from the bank 5 Nov).
- Not copying real SNBT items. PM items are original, in the style we researched.

## Anti-goals (failure even if it "works")

- A question that needs knowledge of ESP32, BLE, MQTT or LoRa to answer. The module only
  supplies the code's *shape and values*; the answer comes from reading C.
- PM items with ambiguous wording or two defensible answers.
- A bank that looks 50/50 but where one half is trivially easy or duplicated.

## Decisions (the user's)

- 40 by default, split evenly: 20 PM, 20 module.
- Module questions are C, from the module in `Downloads/IRIS ASO/Module - IRIS IoT`
  (`main_id.typ`, `kode_praktikum/id/*.ino`).
- PM questions follow UTBK PM style; researched from public sample banks.
- FITB is its own part with only the `fitb` style; Logika has no `fitb`.
- Per-part answer styles: Logika `single, multi, order, match`; FITB `fitb`;
  Kodingan `lines, fix` (Kodingan lock is the assistant's call, accepted by the user).

## Decisions (assistant's calls, flagged)

- Module code is rewritten as **plain C** (`main`, `printf`, `int`/`char`/`unsigned char`,
  `snprintf`, `static`, pointers to `int`), keeping the module's names and numbers (`SEND_INTERVAL
  1000`, `counter`, `LORA_SPREADING_FACTOR 12`, `interval 60000`, `char message[50]`,
  `hello %d`, `192.168.1.100`, port `8765`) so it still feels like the module.
- No function pointers or structs in questions (the module's callbacks and `sRFM_pins` are too
  far from what candidates know); the *behaviour* of a callback is tested with a `switch` instead.
- Style mix per half (builder may adjust): module 14 single, 2 multi, 2 order, 2 match;
  PM 17 single, 3 multi. Every question `sample: true`, `status: ready`, `lang: c`
  (`lang` is only a label; PM items carry no code).
- PM difficulty mix: about 8 easy, 8 medium, 4 harder (UTBK tags its harder ones "HOTS").
- Per-candidate draw stays random (`shown 15` of the 40 pool), so one candidate can see 9 PM and
  6 module. The *bank* is 50/50; a forced per-candidate 50/50 would need a new draw rule and is
  out of scope unless the user asks.

## Research summary

UTBK SNBT PM: 20 questions in the Tes Literasi block; school maths (SMP/SMA) in everyday
contexts; shown mostly as single answer with 5 options, some multi-select ("bisa lebih dari
satu", each option a statement), some short numeric answer, and chained sets sharing one
stimulus. Recurring topics: percentage and discount, profit and tax brackets, averages,
number patterns and arithmetic series, ratios and scale, speed-distance-time, combined work,
Venn-style counting, empirical probability from a table, linear equations from weighings,
simple inequalities, area/volume, cheapest-combination reasoning. Stems are a short Indonesian
story, numbers with units, a "Catatan" line when rounding matters, one quantity asked.
Sources: Ruangguru, Brain Academy and Kompas sample pages (Brain Academy and Kompas were read;
Ruangguru's page returned no text).

IRIS IoT module code (what the 20 module questions draw from): non-blocking timers with
`millis()` and `SEND_INTERVAL`; counters incremented after each send (`counter++`, every 5 s or
60 s); `#define` pin and parameter constants; `switch` on event types with `break`/`default`;
`while` reconnect loops with `delay`; boolean connection flags with `&&`; `char message[50]`
and `snprintf`; `static` locals; `uint8_t`/`unsigned int` values; `sizeof`; `map`/`constrain`
range scaling.

## Module question topics (20; one question each, builder picks exact numbers)

1. Non-blocking timer: how many sends in a window, given an array of timestamps and an interval.
2. Counter printed then incremented (`hello %d` sequence) after N loops.
3. Counter incremented before vs after print (post/pre-increment).
4. `switch` on event codes with a missing `break` (fall-through).
5. `switch` with `default` for an unknown event.
6. Reconnect `while` loop: total wait in ms after k failed tries, then success.
7. Connection flag with `&&` and a timer: does the send block run (short circuit with side effect).
8. `snprintf` into `char message[50]`: what is stored, or what `strlen` prints.
9. `snprintf` truncation with a small size.
10. `static int` counter in a function called three times.
11. Value changed through an `int *` parameter (message counter) vs a copy.
12. `unsigned char` wrap-around (`250 + 10`).
13. Integer division and `%` converting milliseconds to seconds and leftover ms.
14. `map`-style scaling written as one integer expression (ADC 0-4095 to 0-100), truncation.
15. Match: each `#define` or macro expression to the value it gives.
16. `sizeof arr / sizeof arr[0]` to count elements, then loop.
17. Order: arrange the lines of a loop that scans a `char` buffer to `'\0'` and counts a letter.
18. Multi-select: which statements about a given `#define` and a `constrain`-style clamp are true.
19. Match: each increment or `%` / `/` expression to what it prints.
20. Order: arrange the lines of a small send loop (timer check, send, update previous, counter++)
    so it prints the stated output.

Styles by topic: multi = 7 and 18; order = 17 and 20; match = 15 and 19; the other 14 are
single. Item 7 is written as "which of these statements are true" instead of one answer.

## PM question topics (20)

Percent change and discount; profit and loss; progressive tax bracket (as a text list, no image);
averages and a missing value; arithmetic series; number pattern (rows of seats or tiles);
ratio and map scale; speed, distance, time; combined work rate; Venn-style counting with
percentages; empirical probability from a small table; linear equations from weighings;
simple inequality from a formula; area and perimeter composite shape; volume and unit
conversion; cheapest combination of shipping options; statements about a table (multi-select);
statements about a pattern (multi-select); a "which is always true" logic item (multi-select);
a two-step word problem with rounding note. Chained "shared stimulus" sets are not used (the
bank draws questions independently). Every statement or number a PM question needs is in its own
stem.

## Part-to-style rule (app change)

- `exam-types.ts`: add `FORMATS_BY_PART: Record<Phase1Part, readonly Format[]>` =
  logika `single, multi, order, match`; fitb `fitb`; kodingan `lines, fix`. Keep `FORMATS`.
- `bank-rules.ts` `validateQuestion`: reject a format not in the part's list with a new error
  code (builder names it, Indonesian message in `bankStrings.ts`, plain wording).
- `BankEditor.tsx` `FormatPick`: list only the part's styles. Changing a question's part resets
  its style to the part's first style and clears the answer (same as today's `changeFormat`).
  New question draft starts on the part's first style.
- `BankList.tsx` format filter: when a part filter is set, offer only that part's styles.
- `bank-io.ts` import: report the same error per question; export unaffected.
- `api/_lib/recruitment-bank.ts` `question-save`: relies on the validator; no separate path.
- Existing questions that already break the rule (check prod read-only first, using the
  `.env.production.local` + `psql` route in memory): not auto-changed; they just fail on
  next save until the part or style is fixed. Report the count to the user.
- Tests: extend the existing bank tests (rules, io, draft) for accept and reject cases per part;
  `recruitment-bank-io.test.ts` expects the contoh sheet to cover every format, which
  `00-contoh.md` already does with one question per format under its proper part, so it must keep
  passing. Update its inline copy if a contoh item violates the new rule.

## Content pipeline

- Replace the 36 Logika entries in `apps/web/scripts/rec-bank/01-logika.md` with the 40.
- C items: extend `scripts/rec-bank-verify.py` flow (gcc compile and run, compare to the key;
  it already does this for the current bank, 477 checks at last count). Module items must compile
  with `gcc -Wall -Wextra` clean.
- PM items: add a small independent Python check per item (recompute the answer from the stem
  numbers, not from the key) kept in `scripts/rec-bank-verify.py` or a sibling file; every PM key
  must pass it. Exactly one defensible answer per item; distractors are plausible slips
  (forgot a step, percent of the wrong base).
- Wording: everyday Indonesian, tech words in English (array, input, output), per the plain-copy
  rule. No images, no tables unless the editor's prompt renderer is confirmed to show them;
  use short lists.
- Seeds ship through the existing `Pasang Soal Bawaan` flow, which updates untouched seeds and
  deletes ones that left the bank. The user presses it on prod in both editions; the assistant
  does not.

## Builder starting point

The local checkout is on `oprec-caas-dot` with a dirty tree and is stale against `main`. Work in a
clean worktree off `origin/main`. Do not commit `src/lib/db.ts` RIG-ONLY edits. Write files with
the Write tool (heredocs with backslashes get mangled). Ask the user before pushing or deploying.

## Open for the user

- Whether per-candidate draws should be forced to equal PM and module halves (default: no).
