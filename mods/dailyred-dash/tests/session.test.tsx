import { describe, expect, mock, test } from 'claude-code/testing'
import { atAction } from './fixtures'

const exploring = '{"phase":"exploring","menu":"none","result":"none","message":"","player":null,"enemy":null,"party":[]}'
const PANE_PROPS = { title: 'DAILY RED', isFocused: true, bodyColumns: 64, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 22 }, view: {} }

function fakeRunner(on: any, lines: string[], spawned: string[][]) {
  on('process.spawn', async function* (_$: unknown, e: { argv: string[] }) {
    spawned.push([...e.argv])
    for (const line of lines) yield { stream: 'stdout' as const, text: line + '\n' }
    return { value: { code: 0, signal: null } }
  })
}

// What the engine provides beneath the plugin and the kit leaves to the test: a pane and a store.
function engine(on: any) {
  const store = new Map<string, unknown>()
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', (_$: unknown, e: { name: string }) => ({ value: e.name === 'DAILYRED_HOME' ? '/dailyred-test' : undefined }))
  on('store.get', (_$: unknown, e: { key: string }) => ({ value: store.get(e.key) }))
  on('store.set', (_$: unknown, e: { key: string; value: unknown }) => { store.set(e.key, e.value); return { value: undefined } })
  return store
}

function setUp(on: any, writes: string[] = []) {
  engine(on)
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: '{}' }))
  on('fs.write', (_$: unknown, e: { text: string }) => { writes.push(e.text); return { value: undefined } })
}

async function pane($: any) {
  return $.ui.mount({ plugin: 'dailyred-dash', surface: 'terminal', component: 'Pane', requestId: 'dailyred', props: PANE_PROPS })
}

describe('a daily session', () => {
  test('without setup, /dailyred says to run setup and starts nothing', async ($, on) => {
    const clock = mock.clock(on)
    const spawned: string[][] = []
    fakeRunner(on, [], spawned)
    engine(on)
    on('fs.exists', () => ({ value: false }))
    await $.command.run({ command: 'dailyred' })
    await clock.advance(0)
    const ui = await pane($)
    expect(await ui.find({ type: 'Text', text: /\/dailyred setup/ })).toBeDefined()
    expect(spawned.length).toBe(0)
    await ui.unmount()
  })

  test('starts the runner with today\'s seed in daily mode', async ($, on) => {
    const clock = mock.clock(on)
    const spawned: string[][] = []
    fakeRunner(on, [exploring], spawned)
    setUp(on)
    await $.command.run({ command: 'dailyred' })
    await clock.advance(0)
    expect(spawned[0]).toContain('--daily')
    expect(spawned[0]![spawned[0]!.indexOf('--seed') + 1]).toMatch(/^\d+$/)
  })

  test('a battle shows both Pokémon, HP and the usable moves as keys', async ($, on) => {
    const clock = mock.clock(on)
    // The runner stays on the action menu: its stream does not end.
    on('process.spawn', async function* () {
      yield { stream: 'stdout' as const, text: JSON.stringify(atAction) + '\n' }
      await new Promise(() => {})
    })
    setUp(on)
    await $.command.run({ command: 'dailyred' })
    await clock.advance(0)
    const ui = await pane($)
    expect(await ui.find({ type: 'Text', text: /CHARIZARD/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /241\/360/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /SOLARBEAM/ })).toBeDefined()
    // GIGA DRAIN has no PP: drawn, but not as a pressable move.
    expect(await ui.find({ type: 'Button', text: /GIGA DRAIN/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /GIGA DRAIN/ })).toBeDefined()
    await ui.unmount()
  })

  test('status conditions show as badges, on the battlers and in the party', async ($, on) => {
    const clock = mock.clock(on)
    const statused = {
      ...atAction,
      player: { ...atAction.player!, status: 'PAR', confused: true },
      enemy: { ...atAction.enemy!, status: 'SLP', confused: false },
      party: atAction.party.map(p => ({ ...p, status: p.name === 'ALAKAZAM' ? 'PSN' : '' })),
    }
    on('process.spawn', async function* () {
      yield { stream: 'stdout' as const, text: JSON.stringify(statused) + '\n' }
      await new Promise(() => {})
    })
    setUp(on)
    await $.command.run({ command: 'dailyred' })
    await clock.advance(0)
    const ui = await pane($)
    expect(await ui.find({ type: 'Text', text: /^SLP$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^PAR$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^CNF$/ })).toBeDefined()
    await ui.press({ key: 'key-s' })
    expect(await ui.find({ type: 'Button', text: /ALAKAZAM.*PSN/ })).toBeDefined()
    await ui.unmount()
  })

  test('no badge without a status', async ($, on) => {
    const clock = mock.clock(on)
    on('process.spawn', async function* () {
      yield { stream: 'stdout' as const, text: JSON.stringify(atAction) + '\n' }
      await new Promise(() => {})
    })
    setUp(on)
    await $.command.run({ command: 'dailyred' })
    await clock.advance(0)
    const ui = await pane($)
    for (const badge of ['SLP', 'PSN', 'TOX', 'BRN', 'FRZ', 'PAR', 'CNF']) {
      expect(await ui.find({ type: 'Text', text: new RegExp(`^${badge}$`) })).toBeUndefined()
    }
    await ui.unmount()
  })

  test('no move is sent while no choice is open', async ($, on) => {
    const clock = mock.clock(on)
    const writes: string[] = []
    on('process.spawn', async function* () {
      yield { stream: 'stdout' as const, text: JSON.stringify({ ...atAction, menu: 'none' }) + '\n' }
      await new Promise(() => {})
    })
    setUp(on, writes)
    await $.command.run({ command: 'dailyred' })
    await clock.advance(0)
    const ui = await pane($)
    expect(await ui.find({ type: 'Button', text: /SOLARBEAM/ })).toBeUndefined()
    expect(writes.some(w => / move /.test(w))).toBe(false)
    await ui.unmount()
  })

  test('the runner ending mid-battle shows retry, and the attempt is not counted', async ($, on) => {
    const clock = mock.clock(on)
    fakeRunner(on, [JSON.stringify(atAction), JSON.stringify(atAction)], [])
    setUp(on)
    await $.command.run({ command: 'dailyred' })
    await clock.advance(0)
    const ui = await pane($)
    expect(await ui.find({ type: 'Text', text: /stopped/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /attempt 0 /})).toBeDefined()
    await ui.unmount()
  })
})
