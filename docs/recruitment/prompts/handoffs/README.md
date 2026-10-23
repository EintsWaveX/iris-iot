# Handoffs

Each session writes `NN.md` here when it finishes, or `15a.md`, `15b.md` and so on for split prompts. Dependent sessions read these before starting.

## Template

```markdown
# NN · <prompt title>

- Session: <name>, <model/effort>, <start> to <end> WIB
- Commits: <hash> <one line>, ... (repo: iris-iot | IRIS ASO)
- Migrations: <number + tables> (applied: rig yes/no, prod yes/no)
- Artifact / mockup URL: <if any>

## Shipped
What exists now, in plain words, per screen or API action.

## Contracts
Types, endpoints, siaran topics, relay messages, file paths that later prompts rely on.

## User rulings
Anything the user decided during this session (also copy to STATUS.md log and the memory file).

## Touched outside my paths
File, why, and who was told.

## Open issues
What isn't done or is known broken, and who should pick it up.

## How to verify
Commands / rig scripts that prove it works.
```
