# How it works

A deep dive into each level. For diagrams, see [flow.md](flow.md).

## The idea behind all three

A language model re-reads its whole context on every turn. So the cost of a message grows with everything that came before it, and quality drops as the context fills with old detail. All three levels attack the same problem at different scales:

| Level | Keeps small | By |
| --- | --- | --- |
| conductor | the main chat | sending bulk work to subagents that read the files and answer in 10 lines |
| conductor-lint | the cleanup after | catching what workers left behind while they run, fixing it in one round |
| conductor-hq | every chat, across days | moving memory into files and doing work in fresh sessions from short briefs |

They nest. The HQ launches a worker session; the worker runs conductor-lint; conductor-lint is conductor plus a gate; conductor sends cards to subagents.

## Level 1 · conductor

**Scope:** one task, one chat. **Who conducts:** the main session, on Opus.

1. **Gate.** Under 3 independent pieces, or one file, the conductor just does it. Orchestration has overhead and only runs when it pays.
2. **Brief.** Your words become an XML brief. Precise phrases are kept verbatim; vague ones are translated, and each translation is listed with a confidence for you to check. "Images side by side that expand" becomes "image accordion", flagged medium.
3. **Cards.** One card per independent piece, in `tasks/todo.md`: files it writes, files it must not touch, skills, agent, model, acceptance checks. You approve before anything runs.
4. **Skills.** For each card, the conductor searches every installed skill by name and description, reads the top of the best few, and picks one primary plus only the supporting skills that add something. No fixed list.
5. **Route.** Model per card, always set explicitly (specialist agents often pin Sonnet in their own definition, which would silently override a missing value):

   | Model | When |
   | --- | --- |
   | Haiku 5.5 | the card passes the **spec test**: exact files, an existing pattern to follow, checks a command can verify |
   | Sonnet 5.5 | judgment: multi-file work without a pattern, unknown-cause bugs, reviews |
   | Opus 5.5 | architecture, auth, payments, migrations, data-loss risk |

   Risk beats size. A card too big for Haiku is split, not sent up whole.
6. **Dispatch.** Parallel only when `writes` lists do not overlap. Workers never spawn workers.
7. **Verify.** The conductor runs the build and tests itself. A failed card retries once on the next model up; a failure on Opus stops and asks you.
8. **Report.** Card · agent · model · skills · result · evidence.

**Mod: agent-ledger.** `/ledger` shows every agent of the session, its model, status, input and output tokens and cache share, read from the engine's own usage numbers. `/ledger-reset <label>` starts a named run; `/ledger-export` saves it as JSON for comparisons.

## Level 2 · conductor-lint

**Scope:** same as conductor. **Adds:** a quality gate, so you do not inherit the leftovers.

- **Linter.** Uses the project's ESLint or ruff. With none, it proposes a one-time setup card.
- **Line budget per card.** Before coding, the worker states its approach and an estimated line count, and has to justify going over. A warning, never an error.
- **Efficiency rules for workers.** Reuse what exists, no speculative abstractions, nothing left unfinished, lint your own files.
- **One fix round.** Findings are collected while cards run and fixed together at the end. Whatever is left is reported to you.

**Mod: agent-lint.** When a worker finishes, it checks only the lines that worker added and reports, ESLint-style: TODOs, stubs, skipped tests, files outside the card's `writes`, the worker's own open issues, ESLint (off until you turn it on, because ESLint runs the project's config as code), line budget, `console` and `any`. Under `/conductor-lint` reports go back to the conductor; under `/conductor` they are only recorded, so both are measured the same way. `/leftovers` opens the pane.

## Level 3 · conductor-hq

**Scope:** one project, many days. **Who conducts:** an HQ chat that is itself short-lived.

### Memory in files

```text
HQ/
├── STATUS.md      now / next / waiting on you (~40 lines, rewritten each close)
├── DECISIONS.md   dated one-liners, newest first
├── BRAND.md       who, audience, voice, colours, handles
├── BACKLOG.md     tasks and ideas, tagged by role
├── ANALYTICS.md   latest numbers and what they mean
├── briefs/        one file per worker task
├── inbox/         one 6-line report per finished brief
└── review/        finished pieces waiting for your OK
```

A new HQ chat reads STATUS, the newest 10 decisions and the **names** of the inbox and review files. That is about a hundred lines, whatever the project's age.

### Modes

| Mode | What happens |
| --- | --- |
| `new <Name>` | Six questions, the folder tree, BRAND and STATUS filled, five starter backlog items |
| `adopt <Name> <paths>` | Read-only inventory → MIGRATION.md → your OK → copy + verify → retarget → rename old folders. See [adopt-guide.md](adopt-guide.md) |
| resume (no argument) | Done since last time, waiting for you, next 3 actions; offers a worker per real task |
| `worker <brief>` | Reads only the brief and the files it names, does the work, writes the inbox report, stops |
| `close` | Rewrites STATUS, adds decisions, files handled inbox reports. The chat can then be closed |

### Briefs and workers

A brief names the goal, the input paths, what the worker may write, 2 to 5 done-when checks, the model and the runner. The model follows conductor's rubric applied to the whole brief. The runner is:

- **`/conductor-lint`** for code, when the project has a linter (else `/conductor`). The worker session starts on Opus and its cards are routed as in level 1.
- **direct** for content, research, community drafts and analytics, on the brief's model.

Workers are **fresh sessions, not forks**: a fork copies the whole conversation, which is exactly what this level avoids. With the agent-ledger mod, each worker brackets its run with `/ledger-reset <slug>` and `/ledger-export`, and its inbox report carries the token count.

### Approval

Workers never post, send, pay or delete. Finished pieces go to `HQ/review/`. The HQ shows each one with its done-when; only on your explicit OK does it hand the piece to your own posting or scheduling skill, and the approval is written to DECISIONS.md.

## What is enforced and what is not

The skills are instructions the model follows. Nothing in Claude Code enforces the routing rubric, the line budget or the approval rule yet. The mods measure (ledger) and report (lint); they do not block. A routing guard is on the roadmap.
