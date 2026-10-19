import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { DEFAULT_FUEL, applyFuel, cacheHit, loadOf, noteSkill, ranked, sumOf, usageReport } from '../hooks/fuel'

const usage = (input: number, output: number, cacheRead = 0, cacheWrite = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheWrite,
})

const breakdown = {
  totalTokens: 40_000,
  rawMaxTokens: 200_000,
  categories: [
    { name: 'System prompt', tokens: 3_000, kind: 'used' },
    { name: 'Messages', tokens: 20_000, kind: 'used' },
    { name: 'Free space', tokens: 160_000, kind: 'free' },
  ],
  skills: {
    skillFrontmatter: [
      { name: 'tdd', source: 'plugin', pluginName: 'everything-claude-code', tokens: 300 },
      { name: 'plan', source: 'plugin', pluginName: 'everything-claude-code', tokens: 200 },
      { name: 'brainstorming', source: 'plugin', pluginName: 'superpowers', tokens: 150 },
      { name: 'mine', source: 'userSettings', tokens: 50 },
    ],
  },
  agents: [
    { agentType: 'everything-claude-code:planner', source: 'plugin', tokens: 400 },
    { agentType: 'reviewer', source: 'userSettings', tokens: 80 },
  ],
  mcpTools: [
    { name: 'mcp__linear__a', serverName: 'linear', tokens: 900, isLoaded: true },
    { name: 'mcp__linear__b', serverName: 'linear', tokens: 700, isLoaded: false }, // deferred: not in the window
  ],
  memoryFiles: [
    { path: '/a/CLAUDE.md', type: 'User', tokens: 1_200 },
    { path: '/b/CLAUDE.md', type: 'Project', tokens: 600 },
  ],
}

// ---------------------------------------------------------------- accounting

test('every request adds to the total, its loop and its model', () => {
  let f = applyFuel(DEFAULT_FUEL, { who: 'main', model: 'claude-opus-5-5', usage: usage(100, 50, 1_000, 200) })
  f = applyFuel(f, { who: 'Explore', model: 'claude-haiku-5-5', usage: usage(10, 5) })
  f = applyFuel(f, { who: 'main', model: 'claude-opus-5-5', usage: null }) // a request with no usage still counts
  expect(f.total).toEqual({ input: 110, output: 55, cacheRead: 1_000, cacheWrite: 200, requests: 3 })
  expect(sumOf(f.total)).toBe(1_365)
  expect(f.byWho.map(e => [e.key, e.tokens.requests])).toEqual([['main', 2], ['Explore', 1]])
  expect(f.byModel.map(e => e.key)).toEqual(['claude-opus-5-5', 'claude-haiku-5-5'])
  expect(ranked(f.byWho)[0]?.key).toBe('main')
  expect(DEFAULT_FUEL.total.requests).toBe(0) // nothing mutated
})

test('the cache hit rate is cache reads over all input, none before any input', () => {
  expect(cacheHit({ input: 100, output: 9, cacheRead: 800, cacheWrite: 100, requests: 1 })).toBe(80)
  expect(cacheHit(DEFAULT_FUEL.total)).toBe(null)
})

test('a skill run adds its estimated tokens, keyed by skill', () => {
  let f = noteSkill(DEFAULT_FUEL, { name: 'tdd', plugin: 'everything-claude-code', text: 'x'.repeat(400) })
  f = noteSkill(f, { name: 'tdd', plugin: 'everything-claude-code', text: 'x'.repeat(41) })
  f = noteSkill(f, { name: 'mine', plugin: null, text: '' })
  expect(f.skills).toEqual([
    { name: 'tdd', plugin: 'everything-claude-code', runs: 2, tokens: 111 },
    { name: 'mine', plugin: null, runs: 1, tokens: 0 },
  ])
})

test('the standing load groups by plugin, MCP server and memory, largest first', () => {
  const l = loadOf(breakdown, 7)
  expect(l.rows).toEqual([
    { label: 'memory files', kind: 'memory', tokens: 1_800, detail: '2 files' },
    { label: 'everything-claude-code', kind: 'plugin', tokens: 900, detail: '2 skills · 1 agent' },
    { label: 'linear', kind: 'mcp', tokens: 900, detail: '1 tool' },
    { label: 'superpowers', kind: 'plugin', tokens: 150, detail: '1 skill' },
    { label: 'userSettings agents', kind: 'agents', tokens: 80, detail: '1 agent' },
    { label: 'userSettings skills', kind: 'skills', tokens: 50, detail: '1 skill' },
  ])
  expect(l.categories).toEqual([
    { name: 'Messages', tokens: 20_000 },
    { name: 'System prompt', tokens: 3_000 },
  ])
  expect([l.at, l.total, l.sources, l.max]).toEqual([7, 40_000, 3_880, 200_000]) // sources: the rows, not the conversation
  expect(loadOf({ ...breakdown, skills: undefined, agents: [], mcpTools: [], memoryFiles: [] }, 0).rows).toEqual([])
})

test('the usage report lists totals, loops, models, the load and skill runs', () => {
  let f = applyFuel(DEFAULT_FUEL, { who: 'main', model: 'claude-opus-5-5', usage: usage(1_000, 2_000, 30_000, 0) })
  f = noteSkill(f, { name: 'tdd', plugin: 'everything-claude-code', text: 'x'.repeat(4_000) })
  const text = usageReport(f, loadOf(breakdown, 0), 1.5)
  expect(text).toMatch(/33k tokens over 1 request · \$1\.50/)
  expect(text).toMatch(/cache hit 97%/)
  expect(text).toMatch(/main\s+33k/)
  expect(text).toMatch(/Opus 5\.5\s+33k/)
  expect(text).toMatch(/everything-claude-code\s+900\s+2 skills · 1 agent/)
  expect(text).toMatch(/tdd \(everything-claude-code\)\s+×1\s+~1k/)
  expect(text).toMatch(/Context now ~40k of 200k/)
  expect(text).toMatch(/Every request carries ~4k from plugins/)
  expect(usageReport(DEFAULT_FUEL, null, null)).toMatch(/no model requests yet/)
})

// ---------------------------------------------------------------- drawing

const pane = (bodyColumns: number) => ({
  plugin: 'fueldeck',
  component: 'Pane' as const,
  requestId: 'fueldeck',
  props: { title: 'Fueldeck', isFocused: true, bodyColumns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 70 }, view: {} },
})

const engine = (on: On) => {
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000, tokens: 40_000, percent: 20, breakdown }, rateLimits: [], cost: { usd: 0.42 } },
  }) as never)
  on('turn.step', async function* () {
    const u = { ...usage(500, 1_500, 20_000, 1_000), model: 'claude-opus-5-5' }
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: u }
    return { turnId: 'T1', index: 0, answer: 'ok', toolUses: [], stopReason: 'end_turn' as const, usage: u }
  })
}

const step = async ($: Parameters<TestBody>[0]) => {
  const s = $.turn.step({ turnId: 'T1', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
  for await (const _ of s) void _
  await s.result
}

// The same session drawn with each set of labels: what each must show, and what icons must not.
const panelCases = [
  { labels: 'icons', header: /^Σ 23k tokens$/, shows: [/◎ 93% cached · ↓500 in · ↑2k out/, /^☰ 4k loaded per request$/, /memory files/, /2 files/, /^◇ skills tdd ×1 ~2k$/, /1 req/], hides: [/fueldeck usage/] },
  { labels: 'words', header: /^fuel$/, shows: [/23k tok/, /hit 93%/, /every request ~4k/, /memory files/, /2 files/, /tdd ×1 ~2k/, /fueldeck usage/], hides: [] },
] as const

for (const c of panelCases) {
  test(`the fuel panel shows totals, the standing load and skill runs (${c.labels})`, { options: { labels: c.labels } }, async ($, on) => {
    engine(on)
    on('skill.prompt', () => ({ text: 'x'.repeat(8_000) }))
    const before = await $.ui.mount({ ...pane(80), surface: 'terminal' })
    expect(await before.find({ text: c.header })).toBeUndefined() // no request yet: no panel
    await before.unmount()

    await step($)
    await $.skill.prompt({ skill: 'tdd', text: 'body', pluginName: 'everything-claude-code', source: 'plugin' })
    await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 'T1', reason: 'answer' })

    for (const surface of ['terminal', 'desktop'] as const) {
      for (const cols of [48, 80, 130]) {
        const ui = await $.ui.mount({ ...pane(cols), surface })
        expect(await ui.find({ text: c.header })).toBeDefined()
        for (const re of c.shows) expect(await ui.find({ text: re })).toBeDefined()
        for (const re of c.hides) expect(await ui.find({ text: re })).toBeUndefined()
        await ui.unmount()
      }
    }
  })
}

test('/fueldeck usage prints the full report', async ($, on) => {
  engine(on)
  await step($)
  const r = await $.command.run({ command: 'fueldeck', args: 'usage' } as never)
  expect(r.text).toMatch(/23k tokens over 1 request/)
  expect(r.text).toMatch(/everything-claude-code/)
})

test('/clear starts the token totals over', async ($, on) => {
  engine(on)
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  await step($)
  await $.session.end({ reason: 'clear', sessionId: 's' } as never)
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  expect(await ui.find({ text: /23k tok/ })).toBeUndefined()
  await ui.unmount()
})
