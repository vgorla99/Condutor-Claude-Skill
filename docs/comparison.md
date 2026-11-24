# Comparing the three levels

The three skills nest: `conductor-lint` is `conductor` plus a quality gate, and `conductor-hq` launches worker sessions that run `conductor-lint`. This page is how to measure what each layer costs and what it buys, in **tokens**, **time**, **quality** and **fix rounds**.

| Arm | What runs | What it adds |
| --- | --- | --- |
| **A** Conductor | `/conductor <prompt>` in one session | subagent cards, model per card |
| **B** Conductor-Lint | `/conductor-lint <prompt>` in one session | ESLint on worker lines, line budget, one fix round |
| **C** Conductor-HQ | HQ session writes a brief → fresh worker session runs `/conductor-lint` → HQ reviews the inbox | memory in files, fresh small sessions, review before anything ships |

## Setup (once per project)

1. Set up the linter and commit it **before** any run. If the project has no ESLint (or ruff) config, arms B and C would spend tokens setting it up and arm A would not.
2. For arm C, run `/conductor-hq new <Name>` (or `adopt`) once beforehand, so the HQ files exist. That setup is not counted.
3. Load both mods in every session of every arm:

```bash
claude --model opus --plugin-dir <repo>/plugins/agent-ledger --plugin-dir <repo>/plugins/agent-lint
```

If the project is yours and trusted, run `/agent-lint eslint on` in every run so ESLint findings are counted the same way. `agent-lint` records silently under `/conductor` (observe mode) and reports back under `/conductor-lint` (report mode).

## The three tasks

Use the same three tasks for all arms, each of a different kind. Model output varies; one run per arm proves nothing.

| # | Kind | Example prompt |
| --- | --- | --- |
| 1 | UI component | "Build an image accordion section: hover/focus expands a panel, stacks on mobile." |
| 2 | Multi-file feature | "Add a pricing page with three plans and a monthly/yearly toggle, wired to the existing plan config." |
| 3 | Bug fix | A real bug from your backlog with a failing test or a clear repro. |

## One run

Start every arm from the same commit, in fresh sessions, on the same model:

```bash
git worktree add ../compare-A-<task> <commit>
git worktree add ../compare-B-<task> <commit>
git worktree add ../compare-C-<task> <commit>
```

| Step | A (Conductor) | B (Conductor-Lint) | C (Conductor-HQ) |
| --- | --- | --- | --- |
| Start | `/ledger-reset A-<task>` + `/leftovers-reset A-<task>` | `/ledger-reset B-<task>` + `/leftovers-reset B-<task>` | HQ session: `/ledger-reset C-hq-<task>` |
| Work | `/conductor <prompt>` | `/conductor-lint <prompt>` | HQ: `/conductor-hq`, ask for the task, approve the brief. Worker session: `/conductor-hq worker <brief>` (it runs `/ledger-reset C-<task>`, `/conductor-lint`, `/ledger-export` itself) |
| End | `/ledger-export` + `/leftovers-export` | `/ledger-export` + `/leftovers-export` | Worker: `/leftovers-export`. HQ: review the inbox, then `/ledger-export` |

Exports land in `~/.claude/conductor-runs/` as `<label>-<time>-ledger.json` and `<label>-<time>-lint.json`. For arm C, add the HQ and the worker ledgers together.

## Scorecard

Fill one row per run. Leave cells empty until measured; never estimate.

| Run | Total tokens | Opus share | Cache hit | Sessions | Workers | Wall time | Lines added | Leftover errors | Final lint errors | Build / tests | Fix rounds | Escalations | Rating (1-5) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-task1 | | | | 1 | | | | | | | | | |
| B-task1 | | | | 1 | | | | | | | | | |
| C-task1 | | | | 2 | | | | | | | | | |
| A-task2 | | | | 1 | | | | | | | | | |
| B-task2 | | | | 1 | | | | | | | | | |
| C-task2 | | | | 2 | | | | | | | | | |
| A-task3 | | | | 1 | | | | | | | | | |
| B-task3 | | | | 1 | | | | | | | | | |
| C-task3 | | | | 2 | | | | | | | | | |

Where each number comes from:

- **Total tokens, Opus share, cache hit, workers, wall time:** `*-ledger.json` (`totals`, `workers`, `wallSeconds`). Arm C: sum of the HQ and worker files.
- **Lines added, leftover errors:** `*-lint.json` (`totals`).
- **Final lint errors, build / tests:** run the project's lint, build and test commands at the end.
- **Fix rounds, escalations:** the conductor's final report (arm C: the worker's report).
- **Rating:** does the result do what you asked, at the quality you want, without a second pass by you?

## Results

Not measured yet. The table above is filled in as runs are done, and this section will summarise them.

## Reading it

- **Token efficiency:** fewer total tokens for the same rating, a lower Opus share, a higher cache hit.
- **Work efficiency:** fewer lines for the same result, fewer leftovers, zero final lint errors, no second pass by you.
- **B vs A:** B spends tokens on its fix round. It wins when that buys fewer leftovers and lines than A leaves you to clean up.
- **C vs B on one task:** C adds an HQ session and a brief, so on a single task it should cost a little more. Its payoff is over days: the HQ never grows long, so the tenth task costs about what the first did. To see that, repeat task 1 after five other tasks in the same project and compare the HQ's tokens per task.
