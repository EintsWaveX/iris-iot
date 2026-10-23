# 02 · Recruitment foundation (data, rights, API, uploads, calendar seed)

- **Model / effort:** Sonnet 5.5, high
- **Needs:** none (runs in parallel with 01)
- **Deadline:** 24 Oct 2026, early, so 03 can build on it
- **Owned paths:**
  - `apps/web/src/lib/schema.ts` (new recruitment section only)
  - `apps/web/drizzle/0048_*`
  - `apps/web/src/lib/recruitment/`
  - `apps/web/api/recruitment/`
  - `apps/web/api/_lib/recruitment-*.ts`
  - `apps/web/src/lib/siaran-topik.ts` (new topics only)
  - tests under `apps/web/src/lib/__tests__/recruitment-*` and `apps/web/api/__tests__/recruitment-*`
- **Skills:**
  - `superpowers:executing-plans`
  - `superpowers:test-driven-development`
  - `api-designer`
  - `sql-pro`
  - `supabase:supabase-postgres-best-practices`
  - `typescript-pro`
  - `superpowers:verification-before-completion`

Read `_RULES.md`, `PRD.md` (sections 2 to 5 and 10) and `ARCHITECTURE.md` (sections 1 to 6).

## Build
1. **Migration 0048 + schema:** `rec_edition`, `rec_committee`, `rec_event`, `rec_event_log`, `rec_candidate`, `rec_document`, `rec_stage_result`, `rec_attendance`, as in ARCHITECTURE section 2.
   - Leave the S2 to S6 tables for later migrations, except where an FK needs them.
   - Add indexes for `(edition_id, nim)` and `(edition_id, starts_on)`.
2. **Seed** (`apps/web/scripts/` or a migration data step, whichever the repo already uses for seeds):
   - Edition 2026 "Open Recruitment Asisten IRIS 2026".
   - Every event in PRD section 3, with kind, dates, daily window, place, internal flag and gates.
   - Do **not** seed committee members. The Ketua and Admin seat them in the UI. Give the rig a fake committee in the rig seed only.
3. **`src/lib/recruitment/`** (pure, unit tested first):
   - `calendar.ts`: event types, kind palette, spanning-bar layout for a month grid (lanes, week splits).
   - `gates.ts`: `gateOpen`, `phaseOf`, `nextPublicEvent`, `visibleEvents(events, viewer)` (candidates get public events plus their own slots).
   - `rights.ts`: the PRD section 4 table, Pencipta excluded from Master, `hakPenuh` gets everything.
4. **API `api/recruitment/[aksi].ts`**, using the `aksi` dispatch in `api/tp/[aksi].ts` and the `denganSiaran` wrapper.

   GET:
   | Action | Returns |
   |---|---|
   | `edition` | the live edition + the viewer's role |
   | `calendar` | events filtered by `visibleEvents` |
   | `me` | the candidate's own row, documents, stage, envelopes (empty in S1) |
   | `banner` | role-aware data for the Home banner, cheap enough for every Home load |
   | `candidates` | Panitia only, filtered by rights |
   | `candidate` | Panitia only, one candidate's detail; documents only with the right |
   | `committee` | the committee |

   POST:
   | Action | Does |
   |---|---|
   | `apply` | Praktikan, gate open |
   | `ticket` | R2 upload ticket for one document kind |
   | `document` | confirm an upload |
   | `withdraw` | candidate withdraws |
   | `review` | Admin/Ketua: approve or revision with a note |
   | `event-save` / `event-move` / `event-delete` | Ketua/Acara; logs to `rec_event_log` when the gated stage has started |
   | `seat` / `unseat` | Ketua; Pencipta/Admin for the Ketua seat |

   - Every write names its siaran topics (`rec-calendar`, `rec-candidates`, `rec-edition`).
5. **Uploads:** reuse `src/lib/tp-r2.ts` + `api/_lib/tp-unggah.ts` ticket signing with the prefix `recruitment/<edition>/<nim>/<kind>/`. PDF only, 5 MB max, checked server side (magic bytes on confirm). Reads use a 10-minute link after the rights check.
6. **Tests:**
   - gates and visibility with a fixed clock in WIB, including the day-boundary cases at 23.59 and 00.00
   - the rights table, cell by cell
   - API leak cases: a Praktikan reading `candidates` or `candidate` gets 403; a candidate's `me` never includes another NIM; a signed-out `banner` carries no names
   - an IDOR test on document reads

## Contract for 03
Write the exact request and response TypeScript types in `src/lib/recruitment/types.ts`. Paste a summary of them in `handoffs/02.md`. 03 builds against those types only.

## Verify
- `npm run check`, lint and vitest (`--maxWorkers=2`).
- Apply the migration on the rig DB, restart the rig API, and curl every action as a visitor, a Praktikan, a Panitia member and the Ketua.
- Don't touch prod. Note in the handoff that prod needs a `pg_dump` and then a by-hand 0048 on the user's go.
