# 09 · Question bank editor, import/export, reference snapshots

- **Model / effort:** Sonnet 5.5, high
- **Needs:** 08 (done)
- **Runs in parallel with:** 10 and 11 (owned paths don't overlap; see `EXAM-ENGINE.md` section 10)
- **Owned paths** (as listed in EXAM-ENGINE section 10; typically):
  - migration for `rec_question`, `rec_reference`
  - `api/_lib/recruitment-bank.ts`, `recruitment-snapshot.ts`
  - the bank and reference actions
  - `components/recruitment/panel/tes/bank/`
- **Skills:**
  - `superpowers:executing-plans`
  - `superpowers:test-driven-development`
  - `typescript-pro`
  - `security-review` (sanitizer)
  - `emil-design-eng`
  - `superpowers:verification-before-completion`

Read `_RULES.md`, `EXAM-ENGINE.md` sections 1, 2, 8 and 10, the signed-off bank editor mockup, and `handoffs/08.md`.

## Build
1. **Bank API:**
   - list, get, save, delete and status (draft or ready) per question
   - import a Markdown/YAML file: dry run first with errors per question, then apply
   - export
   - Rights: Akademik + Ketua only. Publishing is refused while any room of the edition is running.
2. **Bank editor UI:**
   - a list per part, filtered by language and status
   - a format picker
   - an editor per format (code areas use the kit's highlighted editor style from the Kode Jurnal editor)
   - a preview **exactly as the candidate sees it** (reuse 10's renderers once they exist; until then use a shared renderer module that 10 also imports)
   - a pool counter ("12 of 20 siap")
3. **Reference snapshotter:**
   - fetch server side with a time limit and a size cap, sanitize per EXAM-ENGINE section 8, store in R2
   - serve from the IRIS origin with a strict CSP in a sandboxed iframe
   - add a refetch button
   - attach references to a part or a question
4. **Seed for the rig:** 2N SAMPLE questions per part covering every format, marked SAMPLE so they never ship as real ones.

## Tests
- The import round trip for every format.
- Sanitizer cases:
  - script tags, `on*` attributes, `javascript:` links, `<base>`, meta refresh, `form`/`iframe`/`object`
  - SVG with script
  - CSS `url()` to an external host
  - links leaving the page are inert, anchors still work
- Rights.
- Bank hidden from candidates (leak).

## Verify
- Rig: an Akademik account imports a file and previews each format.
- Snapshot GitHub, Arduino reference, ESP-IDF and docs.python.org pages, then confirm in Playwright that clicking every link inside the snapshot navigates nowhere outside.
- Handoff.
