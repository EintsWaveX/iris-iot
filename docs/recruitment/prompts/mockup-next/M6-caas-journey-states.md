# M6 · The CaAs page for the later stages (run AFTER M1, M2, M3)

Read `_CONTEXT.md` first. The CaAs page (`n7-caas`) has the foggy journey, envelopes, schedule and withdraw tools, but the later stages are only text. You make the whole journey real, using the components M1, M2 and M3 exported. The main session has already applied their hooks.

## You own (edit)
`app/screens-rec7b.js` (the `Fog` CaAs page :187, the `n7-caas` registration and its variants), `app/screens-rec7c.js` (`N7.CaasTools` :205, `CAT` envelopes, `DO_NEXT`), `app/rec7.css`. Read-only: the rest.

## Audit result you start from
- Stages with a `DO_NOW` card: berkas, firstmeet, tulis, wawancara, tubes, mengajar. **There is no `diterima` tahap** (not in `TAHAP`, `NOW`, `DO_NOW`); "Naik Tahap" is disabled at mengajar.
- **Tubes:** only a text card ("check in saat tiba"). → embed `N7.R5.CaasTubes` (topic card, check-in, submission, Presentasi slot) in the tools.
- **Mengajar:** only a text card with a hard-coded slot. → use `N7.R6.cfgCaas()` with `PickCard`, `PickDialog`, `ChangeDialog`, shown only when the journey is at Mengajar (Wawancara already works this way through `N7.R4.cfgCaas()`).
- **Envelopes (`CAT`):** has Berkas, Tes Tulis, Wawancara, Tubes. Add **Mengajar (6 Jan 2027, 12:00)** and **Penerimaan** (date as decided in M2), and fix the `n7Hasil=terima` variant that hijacks `CAT[0]`: use `N7.R8.FinalEnvelope`.
- **Failure:** only possible at Tes Tulis. Add the respectful "journey ended" state (`ThanksCard`, frozen journey, no scores) at **Wawancara, Tubes and Mengajar** as well, with the right envelope text.
- `DO_NEXT` (rec7c :268) is defined but unused → use it or delete it.
- The custom `n7-chead` header has no area colour; the `r1Caas` states tamu, tutup, buka, menunggu, revisi still render the old `r1-caas` through `P9.OLD` → bring them into the Fog page, one design.
- `CaasTools` drawers (Berkasku, Amplop, Jadwalku) are now centered modals; keep them so. Withdraw stays a hold button.

## Build
1. Add the `diterima` stage to the journey (stars, `TAHAP`, `NOW`, `DO_NOW`, fog rules: passed stages clear, current glows, the rest under mist) and let "Naik Tahap" walk the whole road in the practice/demo control.
2. Tools and cards per stage as above. Only what is relevant to the current stage appears (the user's rule: the candidate sees only what is relevant based on their journey).
3. The final **celebration** for an accepted candidate (M2's envelope) and the **not-accepted** version.
4. The Calendar and the Berikutnya card per stage (dates in `_CONTEXT.md`).
5. Every state reachable in the `n7-caas` variant menus (stage x schedule x envelope x outcome). The sweep must still print `bad: 0`.

## Done
As in `_CONTEXT.md`, plus a flow test that walks one candidate from Berkas to Diterima and one who ends at each stage, in dark and light at 1440x900 and 1440x640.
