import { describe, expect, mock, test } from 'claude-code/testing'
import { atAction } from './fixtures'

// What the engine provides beneath the plugin and the kit leaves to the test.
function engine(on: any, spawned: string[][]) {
  const store = new Map<string, unknown>()
  on('session.start', () => ({ cwd: '/tmp' }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', (_$: unknown, e: { name: string }) => ({ value: e.name === 'DAILYRED_HOME' ? '/dailyred-test' : undefined }))
  on('store.get', (_$: unknown, e: { key: string }) => ({ value: store.get(e.key) }))
  on('store.set', (_$: unknown, e: { key: string; value: unknown }) => { store.set(e.key, e.value); return { value: undefined } })
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: '{}' }))
  on('fs.write', () => ({ value: undefined }))
  on('process.spawn', async function* (_$: unknown, e: { argv: string[] }) {
    spawned.push([...e.argv])
    yield { stream: 'stdout' as const, text: JSON.stringify(atAction) + '\n' }
    return { value: { code: 0, signal: null } }
  })
  return store
}

// The kit does not start a session by itself: start one after the mocked clock is in place, so the
// plugin's idle timer runs on it.
async function start($: any) {
  await $.session.start({ source: 'startup', cwd: '/tmp' })
}

describe('attract mode', () => {
  test('starts a demo after 15 idle minutes, with a random seed and no daily flag', async ($, on) => {
    const clock = mock.clock(on)
    const spawned: string[][] = []
    engine(on, spawned)
    await start($)
    await clock.advance(14 * 60 * 1000)
    expect(spawned.length).toBe(0)
    await clock.advance(2 * 60 * 1000)
    // The fake runner ends at once, so the demo starts again a minute later: attract mode keeps cycling.
    expect(spawned.length).toBeGreaterThanOrEqual(1)
    expect(spawned.every(argv => !argv.includes('--daily'))).toBe(true)
  })
  test('a demo never touches the stats', async ($, on) => {
    const clock = mock.clock(on)
    const store = engine(on, [])
    await start($)
    await clock.advance(16 * 60 * 1000)
    expect(store.get('stats')).toBeUndefined()
  })
  test('a command resets the idle time', async ($, on) => {
    const clock = mock.clock(on)
    const spawned: string[][] = []
    engine(on, spawned)
    await start($)
    await clock.advance(10 * 60 * 1000)
    await $.command.run({ command: 'dailyred', args: 'stop' })
    await clock.advance(10 * 60 * 1000)
    expect(spawned.length).toBe(0)
  })
})
