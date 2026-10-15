// The cases the final review found: a silent runner, demo re-sends, a finished battle, Struggle, the
// switch toggle, per-instance command files, crash attempts and setup running twice.
import { describe, expect, mock, test } from 'claude-code/testing'
import { atAction } from './fixtures'

const PANE_PROPS = { title: 'DAILY RED', isFocused: true, bodyColumns: 64, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 22 }, view: {} }

function engine(on: any, writes: string[] = []) {
  const store = new Map<string, unknown>()
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', (_$: unknown, e: { name: string }) => ({ value: e.name === 'DAILYRED_HOME' ? '/dailyred-test' : undefined }))
  on('store.get', (_$: unknown, e: { key: string }) => ({ value: store.get(e.key) }))
  on('store.set', (_$: unknown, e: { key: string; value: unknown }) => { store.set(e.key, e.value); return { value: undefined } })
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: '{}' }))
  on('fs.write', (_$: unknown, e: { text: string }) => { writes.push(e.text); return { value: undefined } })
  return store
}

// A runner that prints `lines`, then stays alive and silent until the mod ends it.
function hangingRunner(on: any, lines: string[], log: { spawned: string[][]; ended: number }) {
  on('process.spawn', async function* (_$: unknown, e: { argv: string[] }, next: { signal: AbortSignal }) {
    log.spawned.push([...e.argv])
    try {
      for (const line of lines) yield { stream: 'stdout' as const, text: line + '\n' }
      // Alive until killed, as a real child is when the mod ends its stream.
      await new Promise(r => next.signal.addEventListener('abort', r))
    } finally {
      log.ended++
    }
    return { value: { code: 0, signal: null } }
  })
}

async function pane($: any) {
  return $.ui.mount({ plugin: 'dailyred-dash', surface: 'terminal', component: 'Pane', requestId: 'dailyred', props: PANE_PROPS })
}

const noPP = { ...atAction, player: { ...atAction.player!, moves: atAction.player!.moves.map(m => ({ ...m, pp: 0 })) } }
const lastOneStanding = { ...atAction, party: atAction.party.map(p => (p.active ? p : { ...p, hp: 0 })) }

describe('the session owns its runner', () => {
  test('a runner silent for 10 seconds is ended and the pane offers a retry', async ($, on) => {
    const clock = mock.clock(on)
    const log = { spawned: [] as string[][], ended: 0 }
    hangingRunner(on, [JSON.stringify({ ...atAction, menu: 'none' })], log)
    engine(on)
    await $.command.run({ command: 'dailyred' })
    await clock.advance(12_000)
    expect(log.ended).toBe(1)
    const ui = await pane($)
    expect(await ui.find({ type: 'Text', text: /no response/ })).toBeDefined()
    await ui.unmount()
  })

  test('a crash after RED appeared does not count as an attempt', async ($, on) => {
    const clock = mock.clock(on)
    const log = { spawned: [] as string[][], ended: 0 }
    hangingRunner(on, [JSON.stringify(atAction)], log)
    const store = engine(on)
    await $.command.run({ command: 'dailyred' })
    await clock.advance(12_000)
    const days = (store.get('stats') as { days: Record<string, { attempts: number }> } | undefined)?.days ?? {}
    expect(Object.values(days).every(d => d.attempts === 0)).toBe(true)
  })

  test('a finished daily battle ends its runner', async ($, on) => {
    const clock = mock.clock(on)
    const log = { spawned: [] as string[][], ended: 0 }
    hangingRunner(on, [JSON.stringify(atAction), JSON.stringify({ ...atAction, menu: 'none', result: 'won' })], log)
    engine(on)
    await $.command.run({ command: 'dailyred' })
    await clock.advance(0)
    expect(log.ended).toBe(1)
  })

  test('each Claude Code instance has its own commands file', async ($, on) => {
    const clock = mock.clock(on)
    const log = { spawned: [] as string[][], ended: 0 }
    hangingRunner(on, [JSON.stringify(atAction)], log)
    engine(on)
    await $.command.run({ command: 'dailyred' })
    await clock.advance(0)
    const argv = log.spawned[0]!
    expect(argv[argv.indexOf('--commands') + 1]).toMatch(/\/commands-[a-z0-9]+$/)
  })

  test('setup refuses to start a second time, and a battle waits for it', async ($, on) => {
    const clock = mock.clock(on)
    const log = { spawned: [] as string[][], ended: 0 }
    hangingRunner(on, [], log)
    engine(on)
    await $.command.run({ command: 'dailyred', args: 'setup' })
    await clock.advance(0)
    const again = await $.command.run({ command: 'dailyred', args: 'setup' })
    const play = await $.command.run({ command: 'dailyred' })
    await clock.advance(0)
    expect(log.spawned.length).toBe(1)
    expect(JSON.stringify(again)).toContain('setup is running')
    expect(JSON.stringify(play)).toContain('setup is running')
  })
})

describe('keys that always lead somewhere', () => {
  test('with every move out of PP, STRUGGLE is offered', async ($, on) => {
    const clock = mock.clock(on)
    hangingRunner(on, [JSON.stringify(noPP)], { spawned: [], ended: 0 })
    engine(on)
    await $.command.run({ command: 'dailyred' })
    await clock.advance(0)
    const ui = await pane($)
    expect(await ui.find({ type: 'Button', text: /STRUGGLE/ })).toBeDefined()
    await ui.unmount()
  })

  test('no switch key when no other Pokémon can come out', async ($, on) => {
    const clock = mock.clock(on)
    hangingRunner(on, [JSON.stringify(lastOneStanding)], { spawned: [], ended: 0 })
    engine(on)
    await $.command.run({ command: 'dailyred' })
    await clock.advance(0)
    const ui = await pane($)
    expect(await ui.find({ type: 'Button', text: /switch/ })).toBeUndefined()
    await ui.unmount()
  })

  test('s opens the party and s again goes back to the moves', async ($, on) => {
    const clock = mock.clock(on)
    hangingRunner(on, [JSON.stringify(atAction)], { spawned: [], ended: 0 })
    engine(on)
    await $.command.run({ command: 'dailyred' })
    await clock.advance(0)
    const ui = await pane($)
    await ui.press({ key: 'key-s' })
    expect(await ui.find({ type: 'Button', text: /ALAKAZAM/ })).toBeDefined()
    await ui.press({ key: 'key-s' })
    expect(await ui.find({ type: 'Button', text: /SOLARBEAM/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('demo mode', () => {
  test('a repeated state does not send the move again', async ($, on) => {
    const clock = mock.clock(on)
    const writes: string[] = []
    hangingRunner(on, [JSON.stringify(atAction), JSON.stringify(atAction), JSON.stringify(atAction)], { spawned: [], ended: 0 })
    engine(on, writes)
    on('session.start', () => ({ cwd: '/tmp' }))
    on('command.register', () => ({ value: undefined }))
    await $.session.start({ source: 'startup', cwd: '/tmp' })
    // 15.5 minutes: a single demo (begun on the 15th minute) that has not reached its 10 s stall check.
    await clock.advance(15.5 * 60 * 1000)
    expect(writes.filter(w => / move /.test(w)).length).toBe(1)
  })
})
