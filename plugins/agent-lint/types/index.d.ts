export type Severity = 'error' | 'warn'

export type Problem = {
  file: string
  line: number
  rule: string
  severity: Severity
  message: string
}

// The worker's contract, read from the <card> XML in its prompt
export type Card = {
  id: string
  title: string
  writes: string[]
  budget: number | null
}

export type LintReport = {
  agentId: string
  model: string
  card: Card | null
  addedLines: number
  problems: Problem[]
  delivered: boolean
}

// report: findings go back to the conductor; observe: recorded only
export type Mode = 'report' | 'observe'

declare module 'claude-code' {
  interface PluginState {
    'agent-lint': { reports: LintReport[]; mode: Mode; label: string; eslint: boolean }
  }
}
