# M2 · Penerimaan and Jadikan Asisten (mockup, R8)

Read `_CONTEXT.md` first. You build the last stage of the road: the Ketua confirms the final list, the accepted CaAs become Asisten, the site celebrates, and the edition closes. This is **the biggest moment of the site**. Based on `17-s6-mengajar-penerimaan.md` (Penerimaan, Jadikan Asisten, final celebration, closing).

## You own (create or edit)
`app/screens-rec8.js`, `app/rec8.css`, `app/rec8-data.js` (all new). Everything else is read-only. Hooks go in your report.

## Ask the user first (the main session passes answers; otherwise use the default and mark "assumption")
1. The **Penerimaan date**. Default: Pengumuman Mengajar, **6 Jan 2027 12:00** (the PRD calendar has no Penerimaan event yet; propose adding "Penerimaan Asisten Baru", kind acceptance, gate `acceptance`, as a hook for `rec-data.js`).
2. Does the final envelope ride on the Pengumuman Mengajar envelope, or is it a separate one? Default: **separate envelope, same day**.
3. The code proposal rule beyond "unique, editable, 3 letters". Default: first letters of the name, then variations; checked against the existing `P9.ASISTEN` codes in the mockup data.

## Facts
- **Only the Ketua** confirms the list and runs Jadikan Asisten. Others see it read-only.
- The final list is a **summary with all stage scores** (Berkas, Tes Tulis total, Wawancara average and verdict, Tubes, Mengajar) behind a **hold button** (`N7.Hold`).
- **Jadikan Asisten**: create Asisten records through the existing tim logic (mockup: show the result), a **proposed 3-letter code, unique and editable before confirm**, **no division**, status aktif, the DEV badge only by the existing rule (none, since there is no division), **Praktikan history kept**, **idempotent** (running it twice creates nobody twice; show the "already done" state), an **audit log entry**. Memory rule: an Asisten who is also a Praktikan counts as Asisten (a "both" badge).
- **Full-screen celebration** for the Panitia when they confirm, and a **final envelope for each accepted CaAs** at the reveal (reuse the real envelope scene `P9.REC2.RevealStage`: seal crack, card rise, confetti, bloom, a chime that respects sound; a lighter version at Low Detail and for reduced motion). Also a respectful **"not accepted"** envelope (journey frozen, no scores shown).
- **Close the edition:** read-only after Penerimaan; the 6-month retention clock starts (documents and answers kept 6 months, then purged by the existing job). Show the clock and what it means.
- Nothing may leak candidates' documents to the new Asisten unless they are Panitia.

## Build (screens, group `q8` "R8 · Penerimaan")
1. `r8-final`: **Penerimaan tab** for the Ketua (area colour + icon hook for `AREA`). One job: confirm the list. Guided three steps: **Tinjau** (the list with all scores, filters, who is in or out, anyone with a proposal conflict flagged), **Kode** (proposed codes, uniqueness check, edit), **Konfirmasi** (summary, hold to confirm). Use a centered modal for the confirm summary. No side drawer.
2. `r8-hasil`: the **result of Jadikan Asisten** with the audit log entry, the idempotent "already done" state, and the new Asisten shown as created (no division).
3. `r8-rayakan`: the **full-screen celebration** for the Panitia (the biggest moment: animate with care; `animate` and `find-animation-opportunities` skills are available).
4. `r8-amplop`: the **final envelope** for an accepted CaAs and the "not accepted" variant. Export `N7.R8.FinalEnvelope` (and the scene config for `RevealStage`) so **M6** embeds it in the CaAs page.
5. `r8-tutup`: **close the edition**: read-only banner on every Panitia tab, the retention clock, what happens to the data.
6. Variants for every state: not confirmed, codes with a clash, confirmed, already promoted, celebration playing, edition closed, role (Ketua vs other Panitia).

## Do not
Run a real promotion. Add a Cutting stage called Penerimaan (it is its own screen, not a fourth Cutting tab; ask first if you think it should be). Add side drawers.

## Done
As in `_CONTEXT.md`, plus: screenshots of the celebration at 1440x900 in dark and light; the reduced-motion and Low Detail versions checked; the exports and hooks listed.
