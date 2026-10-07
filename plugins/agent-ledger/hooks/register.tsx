import { atom, read, update } from 'claude-code'
import type { Register, TurnUsage } from 'claude-code'

import type { AgentRow, ModelTotal, Usage } from '../types'

const PANE = 'agent-ledger'
const MAIN = 'main'
const MAX_ROWS = 100
const ZERO: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

const agents = atom({ plugin: 'agent-ledger', key: 'agents' } as const, [])
const turn = atom({ plugin: 'agent-ledger', key: 'turn' } as const, [])

// claude-opus-5-5 -> opus; unknown ids stay whole
function shortModel(id: string): string {
  const match = id.match(/opus|sonnet|haiku|fable/i)
  return match ? match[0].toLowerCase() : id
}

function addUsage<T extends Usage>(row: T, u: TurnUsage): T {
  return {
    ...row,
    input: row.input + u.input_tokens,
    output: row.output + u.output_tokens,
    cacheRead: row.cacheRead + u.cache_read_input_tokens,
    cacheWrite: row.cacheWrite + u.cache_creation_input_tokens,
  }
}

function k(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

// Share of the prompt served from cache: the efficiency number worth watching
function cacheHit(u: Usage): string {
  const prompt = u.input + u.cacheRead + u.cacheWrite
  return prompt === 0 ? '-' : `${Math.round((u.cacheRead * 100) / prompt)}%`
}

function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length)
}

function line(u: Usage): string {
  return `in ${k(u.input + u.cacheRead + u.cacheWrite)}  out ${k(u.output)}  cache ${cacheHit(u)}`
}

function byModel(rows: readonly AgentRow[]): ModelTotal[] {
  const totals = new Map<string, ModelTotal>()
  for (const row of rows) {
    const found = totals.get(row.model) ?? { model: row.model, ...ZERO }
    totals.set(row.model, {
      ...found,
      input: found.input + row.input,
      output: found.output + row.output,
      cacheRead: found.cacheRead + row.cacheRead,
      cacheWrite: found.cacheWrite + row.cacheWrite,
    })
  }
  return [...totals.values()]
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'agents', description: 'Show every agent, its model and tokens' })
    await $.command.register({ name: 'agents-reset', description: 'Clear the agent ledger' })
    return next(e)
  })

  on('command.run', { command: 'agents' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agents' })
    return { text: 'Agent ledger opened.' }
  })

  on('command.run', { command: 'agents-reset' }, async $ => {
    await update($, agents, () => [])
    await update($, turn, () => [])
    return { text: 'Agent ledger cleared.' }
  })

  // A ledger must never stand between the person and their prompt or a subagent
  on('prompt.submit', async ($, e, next) => {
    await update($, turn, () => [])
    return next(e)
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const agentId = started.agentId
    if (agentId === undefined) {
      return started
    }
    const row: AgentRow = {
      id: agentId,
      kind: e.subagentType,
      task: e.description,
      model: shortModel(started.model),
      status: 'running',
      runs: 0,
      ...ZERO,
    }
    await update($, agents, list => [...list.filter(a => a.id !== agentId), row].slice(-MAX_ROWS))
    return started
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const id = e.agentId ?? MAIN
    const usage = e.usage
    const status = id === MAIN ? 'idle' : e.reason === 'answer' ? 'done' : 'failed'

    await update($, agents, list => {
      const found = list.find(a => a.id === id)
      const base: AgentRow = found ?? {
        id,
        kind: id === MAIN ? 'conductor' : 'agent',
        task: id === MAIN ? 'main session' : '',
        model: usage ? shortModel(usage.model) : '?',
        status,
        runs: 0,
        ...ZERO,
      }
      const counted = usage ? { ...addUsage(base, usage), model: shortModel(usage.model) } : base
      const row: AgentRow = { ...counted, status, runs: counted.runs + 1 }
      return found ? list.map(a => (a.id === id ? row : a)) : [...list, row].slice(-MAX_ROWS)
    })

    if (usage) {
      const model = shortModel(usage.model)
      await update($, turn, list => {
        const found = list.find(t => t.model === model) ?? { model, ...ZERO }
        return [...list.filter(t => t.model !== model), addUsage(found, usage)]
      })
    }
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, agents)
    const room = Math.max(1, Math.floor(((e.viewport?.rows ?? 24) - 8) / 2))

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>No agents yet. Run /conductor or spawn a subagent.</Text>}
        {list.slice(-room).map(row => (
          <Box key={row.id} flexDirection="column">
            <Text>
              {pad(row.kind, 20)} {pad(row.model, 7)} {pad(row.status, 8)} {line(row)}
            </Text>
            {row.task !== '' && <Text dimColor>  {row.task}</Text>}
          </Box>
        ))}
        {list.length > 0 && <Text bold>By model</Text>}
        {byModel(list).map(total => (
          <Text key={total.model}>
            {pad(total.model, 8)} {line(total)}
          </Text>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const totals = await read($, turn)
    if (e.props.hasSurvey || totals.length === 0) {
      return next(e)
    }
    const { Text } = $.ui.resolve(e)
    const summary = totals.map(t => `${t.model} ${line(t)}`).join('  ·  ')
    return <Text dimColor>Last turn: {summary}  (/agents)</Text>
  })
}
