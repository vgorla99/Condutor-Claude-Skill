# ESLint setup card (load only when a project has no ESLint flat config)

Condensed from "Setup completo de ESLint" in vibe-coding-toolkit by Matheus Gomes:
https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/main/docs/prompts/07-eslint-complete-setup.md
MIT License, Copyright (c) 2026 Matheus Gomes. Read the original for the full reasoning and the custom-rule patterns.

## The taste, in four decisions

1. **Two severities only.** `error` = always a bug or always unsafe; it blocks. `warn` = refactoring pressure and heuristics with real false positives; it never blocks a commit or CI.
2. **Formatting is not ESLint's job.** Prettier, Biome or dprint own quotes, semicolons and wrapping. No formatting rules here; leave a one-line comment naming the formatter.
3. **Type-aware lint is a separate, non-blocking tier** (`eslint.typed.config.mjs`, all `warn`, run as `lint:types`, never in pre-commit or CI gates): it is slow and memory-hungry.
4. **Custom rules only for invariants no plugin covers**, after confirming none does.

## Steps for the card

1. **Detect the stack first** and skip what does not apply: TypeScript or plain JS; React or Next.js; an ORM with destructive statements (Drizzle, Prisma); a layered architecture; money handling; a shared input component library.
2. **Install** (ESLint 9, flat config only, no `.eslintrc*` left):
   `eslint @eslint/js typescript-eslint eslint-plugin-security eslint-plugin-import-x eslint-import-resolver-typescript`
   plus, only if they apply: `eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-jsx-a11y @next/eslint-plugin-next`, `eslint-plugin-drizzle`.
3. **`eslint.config.mjs`** as an ordered array (later blocks win): `js.configs.recommended`, `...tseslint.configs.strict`, framework presets, then project blocks, one-off exemptions, test-file relaxations, and `globalIgnores` last.
4. **Error tier:** `no-var`, `prefer-const`, `no-empty` (allow empty catch), `@typescript-eslint/no-require-imports`, `consistent-type-imports` (inline type imports), `no-unused-vars` with `^_` ignore patterns, `security/detect-eval-with-expression`, `import-x/no-unresolved`, `import-x/no-duplicates`, the ORM delete/update-without-where guard when it applies, `react/jsx-no-leaked-render` (a real bug: `count && <X/>` renders "0").
5. **Warn tier:** `security/detect-unsafe-regex`, `detect-possible-timing-attacks`, `detect-child-process`; React `jsx-key`, `no-array-index-key`, `no-danger`; the `jsx-a11y` set. Skip `security/detect-object-injection` (too noisy).
6. **Size and complexity budget, `warn`, production source only:**

   | Rule | Value |
   | --- | --- |
   | `complexity` | 12 |
   | `max-depth` | 4 |
   | `max-statements` | 20 |
   | `max-params` | 4 (stays on for tests) |
   | `max-lines-per-function` | 150, skip blank lines and comments |
   | `max-nested-callbacks` | 3 |

   Plus a file-length ceiling as the one hard `error` (about 350 lines; skip `.d.ts`, generated and barrel files; `warn` on tests).
7. **Ignores**, each with a comment saying why: `node_modules`, build output, coverage, generated code, `*.tsbuildinfo`, lockfiles, the in-repo AI harness folder (`.claude/**`).
8. **Test-file block** (after production blocks): turn off `max-statements`, `max-lines-per-function`, `max-nested-callbacks`, non-null assertion and architecture boundaries; keep `max-params`.
9. **Scripts:** `lint` = formatter check + `eslint . --cache`; `lint:fix`; `lint:types` with the typed config. Run `lint` in pre-commit and pre-push.
10. **Run it for real**, read the output, and fix or consciously re-tune. Do not report the card done before the lint command has run.

## What is deliberately left out

No `max-len` (this taste limits line count, not width), no formatting rules, no blocking type-aware rules.

## How this connects to conductor-lint

The `warn` size budget above is the same pressure as each card's line budget: both ask whether the code needs to be this big. `agent-lint` reports ESLint findings only on the lines a worker added, so an existing codebase's old warnings do not count against new work.
