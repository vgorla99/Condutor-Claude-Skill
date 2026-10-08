import type { Engine } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

const haikuUsage = {
  model: 'claude-haiku-4-5-20251001',
  input_tokens: 1000,
  output_tokens: 200,
  cache_read_input_tokens: 3000,
  cache_creation_input_tokens: 0,
}

// The pane's own props are read-only facts of the surface; the hook reads none of them
async function mountPane($: Engine) {
  return $.ui.mount({
    plugin: 'agent-ledger',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'agent-ledger',
    props: { title: 'Agents', isFocused: false } as never,
  })
}

test('shows a subagent with its type, model, tokens and cache share', async ($, on) => {
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5-20251001', agentId: 'a1' }))
  on('turn.complete', () => ({ text: '' }))
  on('clock.now', () => ({ value: 1_760_000_000_000 }))
  on('env.get', ($, e) => ({ value: e.name === 'USERPROFILE' ? 'C:/Users/test' : undefined }))

  await $.agent.spawn({
    tool_use_id: 'tu1',
    prompt: 'find the auth hook',
    description: 'Find auth hook',
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  })
  await $.turn.complete({
    answer: 'found it',
    durationMs: 10,
    isAborted: false,
    turnId: 't1',
    agentId: 'a1',
    reason: 'answer',
    usage: haikuUsage,
  })

  const pane = await mountPane($)
  // in = 1000 uncached + 3000 cached = 4.0k; cache share 3000 / 4000 = 75%
  expect(await pane.find({ type: 'Text', text: /Explore\s+haiku\s+done\s+in 4\.0k\s+out 200\s+cache 75%/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'Find auth hook' })).toBeDefined()
})

test('counts the main loop as the conductor, and /agents-reset clears the ledger', async ($, on) => {
  on('turn.complete', () => ({ text: '' }))
  on('clock.now', () => ({ value: 1_760_000_000_000 }))
  on('env.get', ($, e) => ({ value: e.name === 'USERPROFILE' ? 'C:/Users/test' : undefined }))

  await $.turn.complete({
    answer: 'plan ready',
    durationMs: 10,
    isAborted: false,
    turnId: 't2',
    reason: 'answer',
    usage: { ...haikuUsage, model: 'claude-opus-5-5' },
  })
  const pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: /conductor\s+opus\s+idle/ })).toBeDefined()

  await $.command.run({ command: 'agents-reset', args: '', origin: { kind: 'composer' } })
  expect(await pane.find({ type: 'Text', text: /No agents yet/ })).toBeDefined()
})

test('/agents-reset names the run and /agents-export saves it as JSON', async ($, on) => {
  const writes: { path: string; text: string }[] = []
  on('turn.complete', () => ({ text: '' }))
  on('clock.now', () => ({ value: 1_760_000_000_000 }))
  on('env.get', ($, e) => ({ value: e.name === 'USERPROFILE' ? 'C:/Users/test' : undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.write', ($, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })

  await $.command.run({ command: 'agents-reset', args: 'A accordion', origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'ok',
    durationMs: 10,
    isAborted: false,
    turnId: 't3',
    reason: 'answer',
    usage: { ...haikuUsage, model: 'claude-opus-5-5' },
  })
  const answer = await $.command.run({ command: 'agents-export', args: '' })

  expect(writes).toHaveLength(1)
  expect(writes[0]?.path).toMatch(/[\\/]\.claude[\\/]conductor-runs[\\/]A-accordion-\d{8}-\d{4}-ledger\.json$/)
  const record = JSON.parse(writes[0]?.text ?? '{}')
  expect(record.label).toBe('A-accordion')
  expect(record.totals.opusShare).toBe('100%')
  expect(record.totals.cacheHit).toBe('75%')
  expect(answer.text).toContain('A-accordion')
})

test('security: a worker cannot clear the ledger', async ($, on) => {
  on('turn.complete', () => ({ text: '' }))
  on('clock.now', () => ({ value: 1_760_000_000_000 }))
  const answer = await $.command.run({ command: 'agents-reset', args: '' })
  expect(answer.text).toContain('only the person')
})
