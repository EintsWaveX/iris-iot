# M7 · Final sweep (run last)

Read `_CONTEXT.md` first. M1 to M6 are done and integrated. Make the whole mockup consistent, complete and ready for the user's decision on the real build.

## You own
Read all. Edit only to fix defects you find, one small change at a time, and list every edit. The main session publishes.

## Checklist
1. **Parity audit across the whole mockup against the old S4 build** (`mockups/recruitment-s4` and artifact `DsJXStMysyhkmxYBnLRRif`) and against the V16 backup (`mockups/recruitment-v16`): every state menu and every feature still reachable. Use `mockup-next/tools/*` and extend them. The 183 of 196 exact-name match from the S1 to S3 merge must not drop; new screens need their own list.
2. **States library:** empty, loading, error, offline, no-permission and read-only (after the edition closes) for every Panitia tab and the CaAs page. Add what is missing, in the existing style.
3. **Phone pass** (390 wide) for every screen: nothing cut off, primary action reachable, modals fit. Laptop sizes first (1280x720, 1440x900, 1680x1050, 1280x600).
4. **Contrast** in dark and light for every new screen (a script exists as `contrast9.mjs` in the main session's scratchpad; recreate it if missing). Known accepted: disabled buttons, locked disabled format cards.
5. **Surface rule audit:** list every `P9.Drawer` and `P9.Pop`. Only the three side-drawer cases (Cutting candidate, Berkas review queue, Malam seat and Room Setup) may use `side`; only small menus may be popovers.
6. **Keyboard and focus:** every modal traps and returns focus, Escape closes, every control has an accessible name, `Kurangi Gerak` and Low Detail still work.
7. **Copy pass:** "CaAs" spelling, no leftover "Rapi", no stale dates (check against the Calendar in `rec-data.js`), English pairs present, no stand-ins.
8. **Cleanup decisions for the user:** retired screens still registered only as component sources; `r1-daftar` retire or keep; the Latihan sandbox, the Pencipta label and API-side fog are design notes only.
9. **Docs:** update `docs/recruitment/prompts/STATUS.md` (one line per finished prompt) and write a short **handoff for the real build** (`handoffs/mockup-final.md`): the screen list with ids, the components that map to real components, the data each screen needs, the rules and decisions, open questions.

## Done
`sweep8.mjs` prints `bad: 0`; `click9.mjs` and every stage flow test pass in dark and light; a written report with the findings fixed, the findings left for the user, and the list of edits.
