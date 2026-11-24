# Start prompts

Copy one into a **new chat**, one project per chat. Replace the `<...>` parts.

## Adopt a project spread over several folders

```text
/conductor-hq adopt <Name> "<first folder>" "<second folder>"
Inventory first, then MIGRATION.md, then wait for my OK. Do not move anything before I approve.
```

Windows example paths: `"C:\Users\<you>\Desktop\<Name>"` `"C:\Users\<you>\Documents\<Name>"`.
macOS / Linux: `"~/Desktop/<Name>"` `"~/Documents/<Name>"`.

## New project

```text
/conductor-hq new <Name>
```

## Every working day

```text
/conductor-hq
```

## Run a worker (fresh chat, in the project folder)

```text
/conductor-hq worker HQ/briefs/<yyyy-mm-dd>-<slug>.md
```

From a terminal, with the brief's model:

```bash
claude --model sonnet "/conductor-hq worker HQ/briefs/<yyyy-mm-dd>-<slug>.md"
```

## End of the day

```text
/conductor-hq close
```

Adopt one project at a time, and check the new folder works before the old ones are renamed.
