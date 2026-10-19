import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { parseConfig } from '../hooks/core'
import { ICON, LEGEND, counts, fmtSpeedIcon, receiptIcons } from '../hooks/icons'

// ---------------------------------------------------------------- pure

test('icons are the default; anything but "words" reads as icons', () => {
  expect(parseConfig({}).labels).toBe('icons')
  expect(parseConfig({ labels: 'words' }).labels).toBe('words')
  expect(parseConfig({ labels: 'nonsense' }).labels).toBe('icons')
})

test('zero counts disappear; the rest keep one short word', () => {
  expect(counts([[0, 'edit'], [2, 'error'], [1, 'agent']])).toBe('2 errors · 1 agent')
  expect(counts([[0, 'edit']])).toBe('')
  expect(counts([[3, 'allowed'], [0, 'denied']], false)).toBe('3 allowed')
  expect(fmtSpeedIcon({ ttftMs: 800, tokPerS: 60.4 })).toBe('⌁ 1st token 0.8s · 60 tok/s')
  expect(fmtSpeedIcon({ ttftMs: 1250, tokPerS: null })).toBe('⌁ 1st token 1.3s')
})

test('a quiet turn reads as its time and cost alone', () => {
  const quiet = { durationMs: 9_000, agents: 0, edits: 0, errors: 0, costDelta: 0.24, reason: 'answer' }
  expect(receiptIcons(quiet)).toBe('last turn 9s · +$0.24')
  expect(receiptIcons({ ...quiet, agents: 2, edits: 1, costDelta: null })).toBe('last turn 9s · 2 agents · 1 edit')
})

test('every glyph is single-width and explained in the legend', () => {
  // Emoji-presentation and East Asian wide ranges that terminals draw two columns wide.
  const wide = /[\u{1F000}-\u{1FFFF}⌚⌛⏩-⏬⏰⏳◽◾☔☕♈-♓♿⚓⚡⚪⚫⚽⚾⛄⛅⛎⛔⛪⛲⛳⛵⛺⛽✅✊✋✨❌❎❓-❕❗➕-➗➰➿⬛⬜⭐⭕]/u
  for (const g of Object.values(ICON)) {
    expect(wide.test(g)).toBe(false)
    expect(LEGEND.includes(g)).toBe(true)
  }
})

// ---------------------------------------------------------------- drawing

const pane = (bodyColumns: number, placement: 'dock' | 'inline' = 'dock') => ({
  plugin: 'fueldeck',
  component: 'Pane' as const,
  requestId: 'fueldeck',
  props: { title: 'Fueldeck', isFocused: true, bodyColumns, placement, scroll: { offset: 0, bodyRows: 70 }, view: {} },
})

const engine = (on: On, status: (string | undefined)[] = [], denyAll = false) => {
  const clock = mock.clock(on)
  on('ui.status', (_$, e) => {
    status.push(e.text)
    return { value: undefined } as never
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.check', (_$, e) => (denyAll ? ({ decision: 'deny', reason: 'no' } as never) : { decision: e.tool === 'Read' ? 'allow' : 'ask' }))
  return clock
}

test('the main box, gate and receipt pair each icon with a word and drop their zeros', async ($, on) => {
  engine(on)
  await $.turn.start({ text: 'go', turnId: 'I1' })
  await $.tool.check({ tool: 'Read', input: { file_path: '/a/b.ts' }, tool_use_id: 'i1' })
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 'i2' })
  await $.turn.complete({ answer: 'ok', durationMs: 9_000, isAborted: false, turnId: 'I1', reason: 'answer' })
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const cols of [48, 80, 130]) {
      const ui = await $.ui.mount({ ...pane(cols), surface })
      expect(await ui.find({ text: /· main$/ })).toBeUndefined()
      expect(await ui.find({ text: /^ · 0 req$/ })).toBeDefined()
      expect(await ui.find({ text: /^⚑ GATE$/ })).toBeDefined()
      expect(await ui.find({ text: /^2 checks$/ })).toBeDefined()
      expect(await ui.find({ text: /^■ 1 allowed {2}$/ })).toBeDefined()
      expect(await ui.find({ text: /^■ 1 pending {2}$/ })).toBeDefined()
      expect(await ui.find({ text: /denied/ })).toBeUndefined() // none denied: not shown
      expect(await ui.find({ text: /^last turn 9s$/ })).toBeDefined()
      expect(await ui.find({ text: /0 edits|0 errors|0 agents/ })).toBeUndefined()
      await ui.unmount()
    }
  }
})

test('gate buttons keep their words, and the legend names only panels on screen', async ($, on) => {
  engine(on)
  const fresh = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  expect(await fresh.find({ text: /^ agents$/ })).toBeUndefined() // no agents, no gate yet
  expect(await fresh.find({ text: /^ gate$/ })).toBeUndefined()
  await fresh.unmount()
  await $.tool.check({ tool: 'Read', input: { file_path: '/a' }, tool_use_id: 'b1' })
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  expect(await ui.find({ text: /^ gate$/ })).toBeDefined()
  expect(await ui.find({ text: /^ agents$/ })).toBeUndefined()
  expect((await ui.find({ key: 'gate-file' }))?.props.label).toBe('file 1')
  await ui.unmount()
})

test('a rate-limit reset reads as an arrow, not ↻', async ($, on) => {
  engine(on)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 19, resetsAt: new Date(3 * 3_600_000 + 10 * 60_000).toISOString() }],
    changed: ['rateLimits'],
  })
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  expect(await ui.find({ text: /19% →3h10m/ })).toBeDefined()
  expect(await ui.find({ text: /↻/ })).toBeUndefined()
  await ui.unmount()
})

test('connectors between panels show only while work flows', async ($, on) => {
  engine(on)
  await $.tool.check({ tool: 'Read', input: { file_path: '/a' }, tool_use_id: 'c1' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const idle = await $.ui.mount({ ...pane(80), surface })
    expect(await idle.find({ key: 'link-gate' })).toBeUndefined()
    expect(await idle.find({ text: /^─+$/ })).toBeUndefined()
    await idle.unmount()
  }
  await $.turn.start({ text: 'go', turnId: 'L1' })
  const busy = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  expect(await busy.find({ key: 'link-gate' })).toBeDefined()
  await busy.unmount()
})

test('the one-line layout above the prompt pairs its glyphs with words too', async ($, on) => {
  engine(on)
  await $.tool.check({ tool: 'Read', input: { file_path: '/a' }, tool_use_id: 'm1' })
  const ui = await $.ui.mount({ ...pane(80, 'inline'), surface: 'terminal' })
  expect(await ui.find({ text: /^⚑ gate $/ })).toBeDefined()
  expect(await ui.find({ text: /^ 1 allowed$/ })).toBeDefined()
  expect(await ui.find({ text: /denied/ })).toBeUndefined()
  await ui.unmount()
})

test('the status line keeps a word beside each glyph, and /fueldeck legend explains them', async ($, on) => {
  const status: (string | undefined)[] = []
  engine(on, status, true)
  await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 'd1' })
  await $.turn.start({ text: 'go', turnId: 'S1' })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 'S1', reason: 'answer' })
  expect(status.filter(Boolean).at(-1)).toMatch(/✗ 1 denied/)
  const r = await $.command.run({ command: 'fueldeck', args: 'legend' } as never)
  expect(r.text).toMatch(/Fueldeck icons/)
  expect(r.text).toMatch(/☰ {2}what every request carries/)
})
