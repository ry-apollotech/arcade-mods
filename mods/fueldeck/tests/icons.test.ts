import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { parseConfig } from '../hooks/core'
import { ICON, LEGEND, fmtSpeedIcon, iconDetail, nonZero, receiptIcons } from '../hooks/icons'

// ---------------------------------------------------------------- pure

test('icons are the default; anything but "words" reads as icons', () => {
  expect(parseConfig({}).labels).toBe('icons')
  expect(parseConfig({ labels: 'words' }).labels).toBe('words')
  expect(parseConfig({ labels: 'nonsense' }).labels).toBe('icons')
})

test('counts become glyphs, and zero counts disappear', () => {
  expect(iconDetail('100 skills · 17 agents')).toBe('100◇ 17◈')
  expect(iconDetail('1 tool')).toBe('1⎔')
  expect(iconDetail('2 files')).toBe('2▤')
  expect(nonZero([['✎', 0], ['✗', 2], ['◈', 0]])).toBe('✗2')
  expect(nonZero([['✎', 0]])).toBe('')
  expect(fmtSpeedIcon({ ttftMs: 800, tokPerS: 60.4 })).toBe('⌁ 0.8s · 60/s')
  expect(fmtSpeedIcon({ ttftMs: 1250, tokPerS: null })).toBe('⌁ 1.3s')
})

test('a quiet turn reads as its time and cost alone', () => {
  const quiet = { durationMs: 9_000, agents: 0, edits: 0, errors: 0, costDelta: 0.24, reason: 'answer' }
  expect(receiptIcons(quiet)).toBe('9s · +$0.24')
  expect(receiptIcons({ ...quiet, agents: 2, edits: 3, costDelta: null })).toBe('9s · ◈2 · ✎3')
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

test('the main box, gate and receipt drop their labels and their zeros', async ($, on) => {
  engine(on)
  await $.turn.start({ text: 'go', turnId: 'I1' })
  await $.tool.check({ tool: 'Read', input: { file_path: '/a/b.ts' }, tool_use_id: 'i1' })
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 'i2' })
  await $.turn.complete({ answer: 'ok', durationMs: 9_000, isAborted: false, turnId: 'I1', reason: 'answer' })
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const cols of [48, 80, 130]) {
      const ui = await $.ui.mount({ ...pane(cols), surface })
      expect(await ui.find({ text: /· main$/ })).toBeUndefined()
      expect(await ui.find({ text: /^effort/ })).toBeUndefined()
      expect(await ui.find({ text: /^ · ×0$/ })).toBeDefined() // requests, no "req"
      expect(await ui.find({ text: /^⚑ GATE$/ })).toBeDefined()
      expect(await ui.find({ text: /^×2$/ })).toBeDefined() // two checks
      expect(await ui.find({ text: /^■1 {2}$/ })).toBeDefined() // one allowed, one pending
      expect(await ui.find({ text: /permissions|allowed|denied/ })).toBeUndefined()
      expect(await ui.find({ text: /^9s$/ })).toBeDefined() // the receipt: no agents, edits or errors to show
      expect(await ui.find({ text: /last turn|0 edits|0 errors/ })).toBeUndefined()
      await ui.unmount()
    }
  }
})

test('gate buttons keep just their counts, and the legend names only panels on screen', async ($, on) => {
  engine(on)
  const fresh = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  expect(await fresh.find({ text: /^ agents$/ })).toBeUndefined() // no agents, no gate yet
  expect(await fresh.find({ text: /^ gate$/ })).toBeUndefined()
  await fresh.unmount()
  await $.tool.check({ tool: 'Read', input: { file_path: '/a' }, tool_use_id: 'b1' })
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  expect(await ui.find({ text: /^ gate$/ })).toBeDefined()
  expect(await ui.find({ text: /^ agents$/ })).toBeUndefined()
  expect((await ui.find({ key: 'gate-file' }))?.props.label).toBe('1')
  expect((await ui.find({ key: 'gate-shell' }))?.props.label).toBe('0')
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

test('the one-line layout above the prompt uses the same glyphs', async ($, on) => {
  engine(on)
  await $.tool.check({ tool: 'Read', input: { file_path: '/a' }, tool_use_id: 'm1' })
  const ui = await $.ui.mount({ ...pane(80, 'inline'), surface: 'terminal' })
  expect(await ui.find({ text: /^⚑ $/ })).toBeDefined()
  expect(await ui.find({ text: /^ ✓1$/ })).toBeDefined()
  expect(await ui.find({ text: /allowed|denied/ })).toBeUndefined()
  await ui.unmount()
})

test('the status line is glyphs too, and /fueldeck legend explains them', async ($, on) => {
  const status: (string | undefined)[] = []
  engine(on, status, true)
  await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 'd1' })
  await $.turn.start({ text: 'go', turnId: 'S1' })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 'S1', reason: 'answer' })
  expect(status.filter(Boolean).at(-1)).toMatch(/✗ 1/)
  expect(status.some(s => s?.includes('denied'))).toBe(false)
  const r = await $.command.run({ command: 'fueldeck', args: 'legend' } as never)
  expect(r.text).toMatch(/Fueldeck icons/)
  expect(r.text).toMatch(/☰ {2}what every request carries/)
})
