# Recruitment session prompts

These are self-contained prompts for separate Claude Code sessions. Each one builds a piece of IRIS Open Recruitment 2026.

## How to run one
1. Open a new Claude Code session in `C:\Users\EintsWaveX\Documents\WebApps\iris-iot`.
2. Set the model and effort the prompt names (`/model opus` or `/model sonnet`, then the effort).
3. Send:
   > Run `docs/recruitment/prompts/NN-<name>.md`. Read `docs/recruitment/prompts/_RULES.md` first.
4. The session checks `STATUS.md` and refuses to start if a prerequisite isn't done.

## Files
| File | What |
|---|---|
| `_RULES.md` | Session protocol, git, rig and UI rules every session follows |
| `STATUS.md` | The board: who is ready, running, done, plus the user rulings log |
| `DEPENDENCIES.md` | The graph, what can run in parallel, the critical paths |
| `handoffs/` | What each finished session leaves for the next |
| `01` … `17` | The prompts |

## Now (wave 2, 24 Oct)
See `WAVE2.md`: **W1** (Opus high), **08c** (Opus high) and **06** (Sonnet high). At most three sessions at once.
