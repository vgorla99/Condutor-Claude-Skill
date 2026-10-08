// Pure functions: parsing and rules, no engine access. register.tsx does the I/O.
import type { Card, LintReport, Problem, Severity } from '../types'

export type AddedLine = { line: number; text: string }
export type StatusEntry = { path: string; isUntracked: boolean }
export type RuleSetting = Severity | 'off'

export const RULES: Record<string, Severity> = {
  'todo-left': 'error',
  'stub-left': 'error',
  'skipped-test': 'error',
  'out-of-scope': 'error',
  'open-issue': 'error',
  'diff-budget': 'warn',
  'console-left': 'warn',
  'any-type': 'warn',
}

const LINE_RULES: { rule: string; pattern: RegExp; message: string; only?: RegExp }[] = [
  { rule: 'todo-left', pattern: /\b(TODO|FIXME|HACK|XXX)\b/, message: 'unfinished marker left in code' },
  { rule: 'stub-left', pattern: /not (yet )?implemented|lorem ipsum/i, message: 'stub or placeholder left in code' },
  // Case-sensitive on purpose: placeholder="Email" is an HTML attribute, PLACEHOLDER is a stub
  { rule: 'stub-left', pattern: /throw new Error\(\s*['"`](TODO|stub)|\bTBD\b|\bPLACEHOLDER\b/, message: 'stub or placeholder left in code' },
  {
    rule: 'skipped-test',
    pattern: /\b(it|test|describe)\.(only|skip)\(|\bx(it|test|describe)\(|@pytest\.mark\.skip/,
    message: 'test skipped or focused',
  },
  { rule: 'console-left', pattern: /\bconsole\.(log|debug)\(|\bdebugger\b/, message: 'debug output left in code' },
  { rule: 'any-type', pattern: /:\s*any\b|\bas any\b|<any>/, message: '`any` type added', only: /\.(ts|tsx)$/ },
]

// Files that do not count toward the line budget: tests, lockfiles, generated output
const BUDGET_EXEMPT = /(\.test\.|\.spec\.|__tests__\/|__mocks__\/|fixtures\/|\.lock$|-lock\.json$|\.snap$|\/generated\/|\.d\.ts$|dist\/|build\/)/

const ESLINT_TARGET = /\.(js|jsx|mjs|cjs|ts|tsx)$/

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`))
  return match ? (match[1] ?? null) : null
}

// <card id="C1" title="..." budget="120"> ... <scope writes="a, b" .../> ... <budget lines="120"/>
export function parseCard(prompt: string): Card | null {
  const open = prompt.match(/<card\b[^>]*>/)
  if (!open) {
    return null
  }
  const scope = prompt.match(/<scope\b[^>]*>/)
  const budgetTag = prompt.match(/<budget\b[^>]*>/)
  const budgetText = attr(open[0], 'budget') ?? (budgetTag ? attr(budgetTag[0], 'lines') : null)
  const budget = budgetText === null ? NaN : Number.parseInt(budgetText, 10)
  const writes = scope ? (attr(scope[0], 'writes') ?? '') : ''
  return {
    id: attr(open[0], 'id') ?? '?',
    title: attr(open[0], 'title') ?? '',
    writes: writes.split(/[,\s]+/).map(w => normalize(w)).filter(w => w !== ''),
    budget: Number.isFinite(budget) ? budget : null,
  }
}

export function normalize(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\.\//, '')
}

// A write entry matches the file itself, a folder prefix ending in /, or a * wildcard
export function inWrites(file: string, writes: readonly string[]): boolean {
  return writes.some(write => {
    if (write.includes('*')) {
      const pattern = write.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')
      return new RegExp(`(^|/)${pattern}$`).test(file)
    }
    return file === write || file.endsWith(`/${write}`) || (write.endsWith('/') && file.includes(write))
  })
}

// git status --porcelain=v1 -uall -z: "XY path\0", renames carry the old path as the next entry
export function parseStatus(stdout: string): StatusEntry[] {
  const entries = stdout.split('\0')
  const result: StatusEntry[] = []
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i] ?? ''
    if (entry.length < 4) {
      continue
    }
    const code = entry.slice(0, 2)
    if (code.includes('R') || code.includes('C')) {
      i += 1
    }
    if (code.includes('D')) {
      continue
    }
    result.push({ path: normalize(entry.slice(3)), isUntracked: code === '??' })
  }
  return result
}

// git diff -U0: "@@ -a,b +c,d @@" then "+text" lines
export function parseAddedLines(diff: string): AddedLine[] {
  const added: AddedLine[] = []
  let next = 0
  for (const raw of diff.split('\n')) {
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      next = Number.parseInt(hunk[1] ?? '0', 10)
    } else if (raw.startsWith('+') && !raw.startsWith('+++')) {
      added.push({ line: next, text: raw.slice(1) })
      next += 1
    }
  }
  return added
}

export function allLines(text: string): AddedLine[] {
  return text.split('\n').map((line, i) => ({ line: i + 1, text: line }))
}

export function lineProblems(file: string, added: readonly AddedLine[]): Problem[] {
  const problems: Problem[] = []
  for (const { line, text } of added) {
    for (const check of LINE_RULES) {
      if (check.only && !check.only.test(file)) {
        continue
      }
      const hit = text.match(check.pattern)
      if (hit) {
        problems.push({ file, line, rule: check.rule, severity: RULES[check.rule] ?? 'warn', message: `${check.message}: ${hit[0]}` })
      }
    }
  }
  return problems
}

export function countsForBudget(file: string): boolean {
  return !BUDGET_EXEMPT.test(file)
}

export function isEslintTarget(file: string): boolean {
  return ESLINT_TARGET.test(file)
}

// The worker's own "open issues:" line, unless it says none
export function openIssue(answer: string): Problem | null {
  const match = answer.match(/open issues?\s*[:\-]\s*(.+)/i)
  const text = match?.[1]?.trim() ?? ''
  if (text === '' || /^(none|n\/a|no\b|nothing|-|—)/i.test(text)) {
    return null
  }
  return { file: 'card', line: 0, rule: 'open-issue', severity: RULES['open-issue'] ?? 'error', message: text.slice(0, 200) }
}

type EslintMessage = { line?: number; ruleId?: string | null; severity?: number; message?: string }
type EslintFile = { filePath?: string; messages?: EslintMessage[] }

// Keep only messages on lines this worker added: old findings are not its leftovers
export function eslintProblems(json: string, addedByFile: ReadonlyMap<string, readonly AddedLine[]>): Problem[] {
  let files: EslintFile[]
  try {
    files = JSON.parse(json) as EslintFile[]
  } catch {
    return []
  }
  const problems: Problem[] = []
  for (const result of files) {
    const absolute = normalize(result.filePath ?? '')
    const file = [...addedByFile.keys()].find(key => absolute.endsWith(`/${key}`) || absolute === key)
    if (file === undefined) {
      continue
    }
    const lines = new Set((addedByFile.get(file) ?? []).map(a => a.line))
    for (const message of result.messages ?? []) {
      if (message.line !== undefined && lines.has(message.line)) {
        problems.push({
          file,
          line: message.line,
          rule: `eslint/${message.ruleId ?? 'parse'}`,
          severity: message.severity === 2 ? 'error' : 'warn',
          message: message.message ?? '',
        })
      }
    }
  }
  return problems
}

// .agentlint.json { "rules": { "console-left": "error", "any-type": "off" } }
export function applySettings(problems: readonly Problem[], settings: Readonly<Record<string, RuleSetting>>): Problem[] {
  return problems.flatMap(problem => {
    const setting = settings[problem.rule]
    if (setting === 'off') {
      return []
    }
    return [setting === undefined ? problem : { ...problem, severity: setting }]
  })
}

export function count(problems: readonly Problem[]): { errors: number; warnings: number } {
  const errors = problems.filter(p => p.severity === 'error').length
  return { errors, warnings: problems.length - errors }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function summary(report: LintReport): string {
  const { errors, warnings } = count(report.problems)
  const budget = report.card?.budget ? ` (budget ${report.card.budget})` : ''
  const lines = `+${report.addedLines} lines${budget}`
  return errors + warnings === 0
    ? `✔ clean · ${lines}`
    : `✖ ${plural(errors + warnings, 'problem')} (${plural(errors, 'error')}, ${plural(warnings, 'warning')}) · ${lines}`
}

// ESLint-style text, grouped by file
export function formatReport(report: LintReport): string {
  const card = report.card ? `${report.card.id}${report.card.title ? ` ${report.card.title}` : ''}` : report.agentId
  const out = [`agent-lint · ${card} (${report.model})`]
  const files = [...new Set(report.problems.map(p => p.file))]
  for (const file of files) {
    out.push(`  ${file}`)
    for (const p of report.problems.filter(q => q.file === file)) {
      const at = p.line > 0 ? String(p.line) : '-'
      out.push(`    ${at.padEnd(5)} ${p.severity.padEnd(5)}  ${p.rule.padEnd(16)} ${p.message}`)
    }
  }
  out.push(summary(report))
  return out.join('\n')
}
