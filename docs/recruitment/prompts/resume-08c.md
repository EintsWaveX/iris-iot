# Resume 08c · S3 mockup (send this to the running session iris-aso-62, or to a fresh Opus 5.5 high session)

- **Model / effort:** Opus 5.5, high
- **State when written (2026-10-24 17:00 WIB):** the mockup runner, candidate and Panitia screens, bank editor, Live Coding screens, zh dictionary and `tools/click-rec3.mjs` exist in `mockups/recruitment-s3/`. `handoffs/08c.md` is drafted. The full ~500-shot sweep was killed by low memory and the click test has not run.
- **Deadline:** the user's sign-off by Mon 26 Oct. 09, 10 and 11 wait on it.

Read `_RULES.md`, `WAVE2.md`, `WAVE3.md`, `08c-s3-mockup.md`, then `handoffs/08c.md`. New ruling to add before the sweep:

**Hotspots can be each candidate's own phone (user, 2026-10-24; EXAM-ENGINE 9.6a).** Add to the mockup: (a) on the Live Coding seat page, a "Hotspot Ponsel Kamu" card where the candidate types SSID and password (masked, never echoed back; a saved state shows only the SSID and a Ganti button; a clear note that a change needs Compile Ulang); (b) in the Master room setup, hotspot rows with an owner that can be a seat ("Milik kursi 12", capacity = its Wi-Fi boards) next to pengawas hotspots as the fallback; (c) the console's "Butuh N hotspot, ada M" and its grouping by hotspot, where one candidate's phone dropping shows as that seat only. Record the ruling in `handoffs/08c.md`.

Then:
1. Free memory (close browsers, stop idle rigs). Run the sweep in small batches, one Playwright script at a time: `node tools/click-rec3.mjs`, then `shots-rec3.mjs` at 360, 390, 768, 820, 1280, 1440, 1680, `SHORT=1` at 1280, a zh pass, `DETAIL=ldm` and `REDUCE=1`, and the light theme. No sideways overflow, no page errors, no missing icons, no dashes in UI copy, title case for headers and buttons.
2. Publish the mockup as its own artifact (never RCXL2f8vcpWhQHhorCeAPz) and put the link in `handoffs/08c.md` and the STATUS row.
3. Finish `handoffs/08c.md`: the screens list with picker ids, the contracts the mockup assumes and the six proposed EXAM-ENGINE additions (marked for W1 and the user, not written in), the verify commands and counts, open issues.
4. Message W1 (iris-aso-28) that it is ready for review, then give the user a short TL;DR with what to look at and the artifact link. Do not mark it signed off yourself; STATUS reads `done (signed off <date>)` only after the user says so, then message W1 to merge S3 into the main artifact and start wave 3.
