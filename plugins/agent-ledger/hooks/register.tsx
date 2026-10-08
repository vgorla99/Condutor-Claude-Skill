import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, TurnUsage } from 'claude-code'

import type { AgentRow, ModelTotal, Usage } from '../types'

const PANE = 'agent-ledger'
const MAIN = 'main'
const MAX_ROWS = 100
const DEFAULT_LABEL = 'run'
const ZERO: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

const agents = atom({ plugin: 'agent-ledger', key: 'agents' } as const, [])
const turn = atom({ plugin: 'agent-ledger', key: 'turn' } as const, [])
const run = atom({ plugin: 'agent-ledger', key: 'run' } as const, null)

function cleanLabel(raw: string): string {
  const label = raw.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return label === '' ? DEFAULT_LABEL : label.slice(0, 60)
}

// 2026-10-08T09:41:00.000Z -> 20261008-0941
function stamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')
}

// Exports go to ~/.claude/conductor-runs, outside any project, so runs made in
// different worktrees land side by side. mkdir through node: there is no shell.
async function exportDir($: EngineInterface): Promise<string> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '.'
  const dir = `${home.replace(/\\/g, '/')}/.claude/conductor-runs`
  // cwd is the home folder: a node.exe inside the project must never be the one that runs
  await $.process.run(['node', '-e', 'require("fs").mkdirSync(process.argv[1], { recursive: true })', dir], { cwd: home })
  return dir
}

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

function addTotals<T extends Usage>(acc: T, row: Usage): T {
  return {
    ...acc,
    input: acc.input + row.input,
    output: acc.output + row.output,
    cacheRead: acc.cacheRead + row.cacheRead,
    cacheWrite: acc.cacheWrite + row.cacheWrite,
  }
}

function tokens(u: Usage): number {
  return u.input + u.output + u.cacheRead + u.cacheWrite
}

function share(part: Usage | undefined, whole: Usage): string {
  return part === undefined || tokens(whole) === 0 ? '0%' : `${Math.round((tokens(part) * 100) / tokens(whole))}%`
}

function byModel(rows: readonly AgentRow[]): ModelTotal[] {
  const totals = new Map<string, ModelTotal>()
  for (const row of rows) {
    totals.set(row.model, addTotals(totals.get(row.model) ?? { model: row.model, ...ZERO }, row))
  }
  return [...totals.values()]
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'agents', description: 'Show every agent, its model and tokens' })
    await $.command.register({ name: 'agents-reset', description: 'Clear the ledger and start a named run: /agents-reset <label>' })
    await $.command.register({ name: 'agents-export', description: 'Save this run to ~/.claude/conductor-runs as JSON' })
    if ((await read($, run)) === null) {
      const startedAt = await $.clock.now()
      await update($, run, () => ({ label: DEFAULT_LABEL, startedAt }))
    }
    return next(e)
  })

  on('command.run', { command: 'agents' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agents' })
    return { text: 'Agent ledger opened.' }
  })

  // Clearing the ledger is the person's call: a worker must not erase its own record
  on('command.run', { command: 'agents-reset' }, async ($, e) => {
    if (e.origin?.kind !== 'composer') {
      return { text: 'agent-ledger: only the person at the prompt can clear the ledger.' }
    }
    const label = cleanLabel(e.args)
    const startedAt = await $.clock.now()
    await update($, agents, () => [])
    await update($, turn, () => [])
    await update($, run, () => ({ label, startedAt }))
    return { text: `Agent ledger cleared. Run "${label}" started.` }
  })

  on('command.run', { command: 'agents-export' }, async $ => {
    const list = await read($, agents)
    const current = (await read($, run)) ?? { label: DEFAULT_LABEL, startedAt: 0 }
    const now = await $.clock.now()
    const byModelTotals = byModel(list)
    const sum = byModelTotals.reduce((acc, t) => addTotals(acc, t), { ...ZERO })
    const opus = byModelTotals.find(t => t.model === 'opus')
    const record = {
      tool: 'agent-ledger',
      label: current.label,
      startedAt: new Date(current.startedAt).toISOString(),
      exportedAt: new Date(now).toISOString(),
      wallSeconds: Math.round((now - current.startedAt) / 1000),
      workers: list.filter(a => a.id !== MAIN).length,
      totals: { ...sum, cacheHit: cacheHit(sum), opusShare: share(opus, sum) },
      byModel: byModelTotals.map(t => ({ ...t, cacheHit: cacheHit(t) })),
      agents: list,
    }
    const path = `${await exportDir($)}/${current.label}-${stamp(now)}-ledger.json`
    await $.fs.write(path, JSON.stringify(record, null, 2) + '\n')
    return { text: `Run "${current.label}" saved: ${path}` }
  })

  // A ledger must never stand between the person and their prompt or a subagent
  on('prompt.submit', async ($, e, next) => {
    await update($, turn, () => [])
    return next(e)
  }).catch(($, e, next) => next(e))

  // The spawn happens in next(e); everything after it stays inside try, so the
  // .catch below can only ever see a spawn that failed, never start a second one
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
      model: shortModel(started.model ?? ''),
      status: 'running',
      runs: 0,
      ...ZERO,
    }
    try {
      await update($, agents, list => [...list.filter(a => a.id !== agentId), row].slice(-MAX_ROWS))
    } catch {
      // the worker runs unrecorded rather than twice
    }
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

  // Wraps the band beneath, so another mod's line (agent-lint) still shows
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const totals = await read($, turn)
    if (e.props.hasSurvey || totals.length === 0) {
      return below
    }
    const { Box, Text } = $.ui.resolve(e)
    const summary = totals.map(t => `${t.model} ${line(t)}`).join('  ·  ')
    return (
      <Box flexDirection="column">
        {below}
        <Text dimColor>Last turn: {summary}  (/agents)</Text>
      </Box>
    )
  })
}
