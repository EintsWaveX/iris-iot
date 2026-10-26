# 19 · Second cloud review: exam runner, master console, Live Coding gateway (read-only, run in the cloud)

Branch `phase9-global-and-asisten`. Review only: do NOT modify, commit or push anything.

The first review (2026-10-26) covered rooms, scoring, bank, migrations 0051 to 0053 and their authorization; its 4 fixes are merged (handoffs/18.md). This one covers what it did not read closely:

1. The exam runner on the seat side (`apps/web/api/_lib/recruitment-seat.ts`, `src/components/recruitment/exam/**`, `src/lib/recruitment/seat-client.ts`): lockdown and strikes, the `ganda` rule, answer autosave vs Kumpulkan, timers (server time vs client clock), reconnect, a seat that opens two tabs, what a candidate can learn or change by calling the API directly (other seats, other rooms, future parts, the answer key, the draw of someone else).
2. The master console and relay room (`apps/relay`, `api/_lib/recruitment-room.ts` console actions, hotspot and kejadian code): who may pause/reopen/move seats or read kejadian, relay ticket and secret handling, anything the `REC_GATEWAY_SECRET` or `REC_PANTAU_PASS` could leak into, replay of tickets.
3. Live Coding (`api/_lib/recruitment-livecode.ts`, `recruitment-lc-grade.ts`, `src/components/recruitment/livecode/**`, `src/lib/recruitment/lc-*.ts`, `apps/gateway` if present, the agent bundle): the sheets rule (two sheets from two people), grader identity, ticket scope, the gateway routes and their auth, WebSocket/HTTP/MQTT proxy abuse, what compile/flash inputs a candidate controls.

Docs for context: `docs/recruitment/prompts/EXAM-ENGINE.md`, `handoffs/10.md`, `11.md`, `12.md`.

Report at most 12 findings, most severe first. For each: file:line, one sentence on the defect, a concrete failing scenario, confidence. Skip style nits and anything already listed as left in `handoffs/18.md`. Say which findings are from reading only. Under 600 words.
