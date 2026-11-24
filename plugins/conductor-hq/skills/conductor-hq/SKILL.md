---
name: conductor-hq
disable-model-invocation: true
description: Turns a chat into the HQ (orchestrator) of one project across days. The HQ's memory lives in HQ/ files, not in the chat. Sets up a new project, adopts an old scattered one (read-only inventory, migration plan, safe copy), or resumes from the HQ files and launches short-lived fresh worker sessions from briefs. Code workers run /conductor-lint or /conductor. Nothing is posted, sent, paid for or deleted without the user's OK. Run only when the user invokes it.
---

# Conductor-HQ

Level 3 of the conductor family. `conductor` orchestrates **subagents inside one chat**; `conductor-lint` adds a quality gate; `conductor-hq` orchestrates **whole sessions across days**.

One project = one **HQ chat** (plans, decides, reviews) + **fresh worker sessions** (do the heavy work, report back, close). The HQ's memory lives in `HQ/` files, never in the chat, so any new chat becomes the HQ in seconds and no chat ever grows long.

Why: a chat re-reads its whole history on every message. A long HQ chat gets slow and expensive; a fresh worker with a 30-line brief starts almost empty.

## Commands

| Command | What it does |
| --- | --- |
| `/conductor-hq new <Name>` | Create an organised project from scratch |
| `/conductor-hq adopt <Name> <path> [<path> ...]` | Organise an existing project spread over one or more folders |
| `/conductor-hq` | Resume: read HQ, show status and the next 3 actions, offer workers |
| `/conductor-hq worker <brief file>` | Run as a worker on one brief, then report to the inbox |
| `/conductor-hq close` | Hand-off: update HQ files so this chat can be closed |

Installed as a plugin, the skill is namespaced: `/conductor-hq:conductor-hq`.

Projects root: `PROJECTS_ROOT` from `~/.claude/conductor-hq.json` if present, else `~/Documents/Claude/Projects` (Windows: `%USERPROFILE%\Documents\Claude\Projects`).

## The organised project

```text
<Projects root>/<Name>/
├── CLAUDE.md          short: what this project is, rules, "read HQ/ first"
├── HQ/
│   ├── STATUS.md      now / next / waiting on the user (max ~40 lines, rewritten, not appended)
│   ├── DECISIONS.md   dated one-liners, newest first
│   ├── BRAND.md       who, niche, audience, voice, colours, fonts, handles, references
│   ├── BACKLOG.md     ideas and tasks, tagged by role
│   ├── ANALYTICS.md   latest numbers and what they mean
│   ├── briefs/        one file per worker task
│   ├── inbox/         worker reports, one file per finished brief (handled ones move to inbox/done/)
│   └── review/        finished pieces waiting for the user's OK
├── content/           reels/ carousels/ posts/ ...
├── assets/            brand/ footage/ photos/
├── site/              website or app code (if any)
├── analytics/         raw exports
└── archive/           old things kept, never loaded
```

Create only the folders the project needs; `HQ/` and `CLAUDE.md` always.

## Mode: new

1. Ask at most 6 questions in one message: name, what it is, platforms and handles, audience, 3 references, goal for the next 90 days.
2. Create the tree, fill `HQ/BRAND.md` and `HQ/STATUS.md`, write a short `CLAUDE.md` that says "read HQ/STATUS.md first".
3. Put 5 starter items in `HQ/BACKLOG.md`. Show the tree and the next 3 actions. Stop.

## Mode: adopt (an old project spread over several folders)

Goal: one organised folder, nothing lost, minimal tokens. **Never delete anything. Never read file contents during the inventory.** Run adopt in its own fresh chat, one project per chat.

1. **Inventory (script, read-only).** Run the inventory script from this skill's `scripts/` folder:
   - Windows: `powershell -ExecutionPolicy Bypass -File scripts/inventory.ps1 -Out "<root>/<Name>/HQ/migration" "<path1>" "<path2>"`
   - macOS / Linux: `bash scripts/inventory.sh "<root>/<Name>/HQ/migration" "<path1>" "<path2>"`

   It writes `inventory.csv` (root, path, type, size, date, SHA-256, private flag) and `SUMMARY.md`. It hashes files but never prints their contents. Read only `SUMMARY.md` plus filtered slices of the CSV, never the whole tree.
2. **Map.** Write `HQ/migration/MIGRATION.md`:
   - the target tree;
   - a move table: source folder → target folder (folders, not single files, wherever possible);
   - duplicates (same hash): keep one, list the rest;
   - conflicts (same name, different content): keep both with a suffix;
   - what goes to `archive/`; files that look private (`.env`, keys, credentials, customer exports): listed by name only, never opened, moved as they are;
   - every place that points to the old paths: CLAUDE.md files, `.claude/skills`, memory notes, links or junctions, editor project files, scheduled tasks.
3. **Stop and wait for the user's OK** on MIGRATION.md.
4. **Copy, then verify.** Copy folder by folder (Windows `robocopy <src> <dst> /E /COPY:DAT /R:1 /W:1 /LOG:<file>`, macOS / Linux `rsync -a`), then compare hashes against `inventory.csv`. Any mismatch: report it and stop.
5. **Retarget.** Update the files from step 2's list. Warn that chats tied to a folder path (for example desktop-app sessions) will not follow the move.
6. **Old folders.** Only after the user confirms the new folder works: rename each old root to `_old-<Name>-<yyyy-mm-dd>`. The user deletes them later, by hand, if they want.
7. **Bootstrap HQ** as in mode new, filling BRAND / STATUS / BACKLOG from what was found. One line per decision in DECISIONS.md.

The full safe-migration walkthrough is in the repo's `docs/adopt-guide.md`.

## Mode: resume (`/conductor-hq`)

1. Read `HQ/STATUS.md`, the newest 10 lines of `HQ/DECISIONS.md`, and only the file **names** in `HQ/inbox/` and `HQ/review/`. Open an inbox report only to summarise it. Nothing else unless needed.
2. Show: done since last time (inbox), waiting for the user (review), the next 3 actions.
3. For each action that is real work, offer a worker. Write `HQ/briefs/<yyyy-mm-dd>-<slug>.md` (format below) and launch it:
   - Claude desktop app: start a new session (fresh, not a fork) in the project folder with the prompt `/conductor-hq worker HQ/briefs/<file>` and the brief's model.
   - Terminal: give the user `claude --model <model> "/conductor-hq worker HQ/briefs/<file>"` to run in the project folder.
4. Small things (a question, one edit, reading one file) stay in the HQ chat. A worker is for a task that ends in something of its own.

### Brief format

```markdown
# <slug>
- goal: one sentence
- inputs: file paths only (never pasted content)
- writes: folders or files the worker may change; everything else is off limits
- done-when: 2 to 5 checks
- role: content | site | code | research | community | analytics
- model: haiku | sonnet | opus   (rubric below)
- run: /conductor-lint | /conductor | direct
- budget: rough time or token ceiling
- needs approval: what must go to review/ instead of being published
```

## Picking the worker's model and runner

Use conductor's routing rubric, applied to the whole brief:

| Model | When |
| --- | --- |
| `haiku` | the brief passes the **spec test**: exact files to write, an existing pattern or example to follow, done-when checks a command or a quick look can verify |
| `sonnet` | judgment: several files or layers, no pattern, unknown-cause bugs, creative pieces with a clear brand guide, research |
| `opus` | architecture, auth, payments, migrations, data-loss risk, hard creative work, anything a wrong answer makes expensive |

Risk beats size. A brief too big for the spec test is split into several briefs rather than sent up a model whole.

Runner:

- **Code** (`site/`, apps, scripts): `run: /conductor-lint` when the project has ESLint or ruff, else `/conductor`. The worker session starts on Opus for that skill and its cards go to Haiku / Sonnet / Opus by the same rubric. Under 3 independent pieces, conductor's gate makes the worker do it inline.
- **Content, research, community, analytics**: `run: direct` on the brief's model, with the skills the brief names.

## Mode: worker

1. Read only the brief and the files it names. Work only in its `writes`.
2. If the brief says `run: /conductor-lint` or `/conductor`, invoke that skill with the brief's goal, done-when and writes as the task.
3. If the `agent-ledger` mod is loaded, start with `/ledger-reset <slug>` and finish with `/ledger-export`, so the HQ sees what the worker cost.
4. Write `HQ/inbox/<slug>.md`, at most 6 lines: what was made, where, what is uncertain, what needs the user, tokens / time (from the ledger export if any), the ledger export path. Put finished pieces that need approval in `HQ/review/`.
5. Stop. A worker never edits STATUS, DECISIONS, BRAND or BACKLOG, never launches other workers, and never publishes, posts, sends or pays.

## Mode: review (part of resume)

For each file in `HQ/review/`: show it to the user with the brief's done-when. On an explicit OK, the HQ may hand it to the user's own posting or scheduling skill, or tell the user to post it. No OK, nothing leaves the folder. Record each approval in DECISIONS.md.

## Mode: close

Rewrite `HQ/STATUS.md` (now / next / waiting), add new decisions to DECISIONS.md, move handled inbox files to `HQ/inbox/done/`. Then tell the user this chat can be closed and the next one starts with `/conductor-hq`.

## Roles

| Role | How it runs | Model |
| --- | --- | --- |
| HQ | the main chat, short-lived, rebuilt from `HQ/` | Opus |
| Code workers | fresh session per brief, `/conductor-lint` or `/conductor` | Opus conducts, cards routed by rubric |
| Content workers (reel, carousel, post, thread) | fresh session per piece | Sonnet; Opus for hard creative work |
| Research / ideas | fresh session or a weekly scheduled routine adding to BACKLOG.md | Sonnet |
| Analytics | weekly routine writing `HQ/ANALYTICS.md` | Sonnet |
| Community (comments, DMs, reviews) | worker, drafts only; the user sends | Sonnet |
| Scheduler | the user's posting skill, only for items approved in review/ | Haiku |

## Rules

- HQ files stay short. STATUS is rewritten, not appended.
- Fresh workers, not forks: a fork copies the whole conversation, which is what this skill avoids.
- Workers get paths, not pasted content, and answer in at most 6 lines.
- Nothing is posted, sent, paid for or deleted without the user's explicit OK.
- Never open secrets or copy them into HQ files.
- One HQ per project. Two projects, two HQ chats.

## Anti-patterns

- Keeping the HQ chat open for days. Close it; the files remember.
- Pasting a worker's full output into the HQ. Read the 6-line inbox report.
- Briefs without `writes`: two workers then edit the same files.
- Running adopt in the same chat as daily work.
