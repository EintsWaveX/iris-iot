# 07 · S2 review, leak audit, ship

- **Model / effort:** Opus 5.5, high
- **Needs:** 06 (done)
- **Skills:**
  - `emil-design-eng`
  - `improve-animations`
  - `design:design-critique`
  - `design:accessibility-review`
  - `code-review`
  - `security-review`
  - `superpowers:verification-before-completion`

Read `_RULES.md` and `handoffs/05.md` and `handoffs/06.md`. Follow the same steps as `04-s1-review-ship.md`, with these extra checks:
- **Animations:**
  - review the reveal videos frame by frame against 05's motion specs
  - interrupting midway (closing the dialog while it is opening) leaves no stuck state
  - nothing jitters on a low-end phone width
  - Low Detail is truly static
- **Reveal security:**
  - try to read an envelope before `reveal_at` through every action, with a changed device clock, and by replaying `envelope-open`
  - a Gagal candidate can't see scores anywhere
- **QR:** a screenshot of the QR shared to someone off-site fails after 20 s, and a token can't be used for another event.
- **Ship:** on the user's go, `pg_dump`, then 0049 by hand, then deploy. Must be live before 9 Nov 2026.
