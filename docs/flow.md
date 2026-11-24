# Flows

Diagrams of how work moves through each level. They render on GitHub.

## How the levels nest

```mermaid
flowchart TD
    U([You]) --> HQ
    subgraph L3["Level 3 · conductor-hq · across days"]
        HQ["HQ chat (Opus)<br/>memory in HQ/ files"]
        HQ -- "brief" --> W1["Worker session<br/>fresh, small"]
        HQ -- "brief" --> W2["Worker session<br/>content / research"]
    end
    subgraph L2["Level 2 · conductor-lint · one session"]
        W1 --> C["Conductor (Opus)<br/>brief → cards → route"]
        C --> H["Haiku card"]
        C --> S["Sonnet card"]
        C --> O["Opus card"]
        H & S & O --> G{"Lint gate<br/>ESLint · line budget · leftovers"}
        G -- "findings" --> F["One fix round"]
    end
    G -- "clean" --> R["Verify build + tests"]
    F --> R
    R --> I["HQ/inbox report (6 lines)"]
    W2 --> I
    I --> HQ
```

Level 1 (`conductor`) is Level 2 without the lint gate.

## Level 1 · conductor (one chat, subagents)

```mermaid
flowchart LR
    P(["/conductor task"]) --> Gate{"3+ independent<br/>pieces?"}
    Gate -- no --> Inline[Do it inline]
    Gate -- yes --> Brief[XML brief +<br/>interpretations]
    Brief --> Cards[Task cards in<br/>tasks/todo.md]
    Cards --> OK{You approve}
    OK --> Route["Skills + agent + model<br/>per card (Haiku first)"]
    Route --> Run[Workers run<br/>parallel if writes don't overlap]
    Run --> Verify{"Conductor runs<br/>build + tests"}
    Verify -- fail --> Up[Retry one model up]
    Up --> Verify
    Verify -- pass --> Report[Report: card · model ·<br/>skills · evidence]
```

## Level 2 · conductor-lint (adds the gate)

```mermaid
flowchart LR
    Card[Card with<br/>line budget] --> Approach[Worker states approach<br/>+ estimated lines]
    Approach --> Code[Writes code,<br/>lints own files]
    Code --> AL["agent-lint checks added lines:<br/>TODO · stubs · skipped tests ·<br/>out-of-scope · ESLint · budget"]
    AL --> Collect[Findings collected<br/>while other cards run]
    Collect --> Fix[One fix round<br/>at the end]
    Fix --> Left[Anything left<br/>goes to you]
```

## Level 3 · conductor-hq (a working day)

```mermaid
sequenceDiagram
    autonumber
    actor You
    participant HQ as HQ chat (Opus)
    participant Files as HQ/ files
    participant W as Worker session (fresh)
    participant Sched as Your posting skill

    You->>HQ: /conductor-hq
    HQ->>Files: read STATUS, last 10 DECISIONS, names in inbox/ + review/
    HQ-->>You: done since last time, waiting for you, next 3 actions
    You->>HQ: go on action 1
    HQ->>Files: write briefs/2026-11-24-pricing.md (goal, writes, done-when, model, run)
    HQ-->>W: start fresh session with /conductor-hq worker and the brief
    W->>W: /ledger-reset · /conductor-lint (cards, gate, verify) · /ledger-export
    W->>Files: inbox/pricing.md (6 lines) + piece in review/
    Note over W: worker closes
    You->>HQ: /conductor-hq (same or next day)
    HQ-->>You: shows review/pricing with its done-when
    You->>HQ: approve
    HQ->>Files: DECISIONS += approved
    HQ->>Sched: hand over (only after your OK)
    You->>HQ: /conductor-hq close
    HQ->>Files: rewrite STATUS, move inbox → inbox/done
```

## Why sessions instead of one long chat

```mermaid
flowchart LR
    subgraph Long["One long chat"]
        M1[msg 1] --> M2[msg 2 re-reads 1] --> M3[msg 30 re-reads 1-29]
    end
    subgraph Fresh["HQ + fresh workers"]
        H1[HQ reads ~100 lines of files] --> B1[Worker reads a 30-line brief]
        H1 --> B2[Worker reads a 30-line brief]
    end
```

Every message in a chat sends the whole history again. Caching softens it, but context still grows, and long contexts are slower and blur the model's attention. Files are a fixed, small cost per session.
