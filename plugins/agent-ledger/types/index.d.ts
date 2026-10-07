export type Usage = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type AgentStatus = 'running' | 'done' | 'failed' | 'idle'

export type AgentRow = Usage & {
  id: string
  kind: string
  task: string
  model: string
  status: AgentStatus
  runs: number
}

export type ModelTotal = Usage & { model: string }

declare module 'claude-code' {
  interface PluginState {
    'agent-ledger': { agents: AgentRow[]; turn: ModelTotal[] }
  }
}
