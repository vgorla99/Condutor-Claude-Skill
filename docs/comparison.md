# Conductor vs Conductor-Lint: how to compare

Both skills share the same flow. Conductor-Lint adds a lint layer: ESLint on every card, a line budget per card, worker efficiency rules, `agent-lint` leftover reports and one fix round. This page is how to measure whether that layer pays for itself, in **tokens** and in **work**.

## Setup (once per project)

1. Set up the linter and commit it **before** any run. If the project has no ESLint (or ruff) config, Conductor-Lint would spend tokens setting it up and plain Conductor would not, which makes the comparison unfair.
2. Load both mods in every run, including the plain Conductor runs:

```bash
claude --model opus --plugin-dir <repo>/plugins/agent-ledger --plugin-dir <repo>/plugins/agent-lint
```

`agent-lint` switches mode by itself: **observe** under `/conductor` (it records leftovers silently, so plain runs are measured too) and **report** under `/conductor-lint` (findings go back to the conductor).

## One run

For each task, start from the same commit, in a fresh session, on the same model:

```bash
git worktree add ../compare-A-<task> <commit>
git worktree add ../compare-B-<task> <commit>
```

| Step | Run A (Conductor) | Run B (Conductor-Lint) |
| --- | --- | --- |
| Start | `/agents-reset A-<task>` and `/leftovers-reset A-<task>` | `/agents-reset B-<task>` and `/leftovers-reset B-<task>` |
| Work | `/conductor <same prompt>` | `/conductor-lint <same prompt>` |
| End | `/agents-export` and `/leftovers-export` | `/agents-export` and `/leftovers-export` |

Exports land in `~/.claude/conductor-runs/` as `<label>-<time>-ledger.json` and `<label>-<time>-lint.json`.

Run **at least three tasks of different kinds** (a UI component, a multi-file feature, a bug fix). Model output varies; one pair of runs proves nothing.

## Scorecard

Copy one row per run. Most numbers come straight from the two export files.

| Run | Total tokens | Opus share | Cache hit | Workers | Wall time | Lines added | Leftover errors | Leftover warnings | Final lint errors | Build / tests | Fix cards | Escalations | Your rating (1-5) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-task1 | | | | | | | | | | | | | |
| B-task1 | | | | | | | | | | | | | |

Where each number comes from:

- **Total tokens, Opus share, cache hit, workers, wall time:** `*-ledger.json` (`totals`, `workers`, `wallSeconds`).
- **Lines added, leftover errors and warnings:** `*-lint.json` (`totals`).
- **Final lint errors, build / tests:** run the project's lint, build and test commands at the end of the run.
- **Fix cards, escalations:** the conductor's final report.
- **Your rating:** does the result do what you asked, at the quality you want?

## Reading it

- **Token efficiency:** fewer total tokens for the same rating, a lower Opus share, a higher cache hit.
- **Work efficiency:** fewer lines for the same result, fewer leftovers, zero final lint errors, no second pass needed by you.
- Conductor-Lint spends some tokens on its fix round. It wins when that spend buys fewer leftovers and fewer lines than Conductor leaves you to clean up by hand.
