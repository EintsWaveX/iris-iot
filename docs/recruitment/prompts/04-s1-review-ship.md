# 04 · S1 review, leak audit, ship

- **Model / effort:** Opus 5.5, high
- **Needs:** 03 (done)
- **Owned paths:** none by default. Fixes go into 03's paths; tell 03's session if it's still running.
- **Skills:**
  - `emil-design-eng`
  - `design:design-critique`
  - `design:accessibility-review`
  - `improve-animations`
  - `code-review`
  - `security-review`
  - `superpowers:verification-before-completion`

Read `_RULES.md` and `handoffs/02.md` and `handoffs/03.md`.

## Do
1. **Emil-lens review** of every S1 screen against the signed-off mockup, at the 7 widths and on a short screen. Fix what is wrong directly. Keep fixes small and in the kit's idiom.
2. **Code review and security review** of the diff since the commit before 02. Pay attention to: the rights checks on every action, the R2 tickets (prefix, size and type enforced server side), gate checks on the server, and the reveal never visible early (S2, but check that the fields are not leaked now).
3. **Leak audit** as a visitor and as a Praktikan: `leak_api.mjs` (add the recruitment actions to its list), `leak_pages.mjs` (add the `/recruitment*` pages), `idor_probe.mjs` (document reads, `candidate` by id), and a bundle scan. A candidate must not see any other NIM, any committee-only field or any review note meant for Admin.
4. `pop2.mjs`, `pop4.mjs`, full vitest and check.
5. **Report to the user:** what changed, the screenshots, the audit result, and the exact ship set (paths + commits).
6. **On the user's go only:**
   - `pg_dump` prod
   - apply 0048 by hand
   - fast-forward deploy (or worktree + cherry-pick if other work is unfinished on the branch)
   - watch CI and Smoke
   - check irisiotlab.com as a visitor and as a test Praktikan
   - record it in `handoffs/04.md` and in the memory file

## Done when
S1 is live and the user has confirmed it, or the user said to hold, with the reason written in STATUS.md.
