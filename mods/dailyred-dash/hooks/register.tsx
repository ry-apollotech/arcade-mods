// dailyred-dash: Daily Red in a pane. /dailyred plays today's team against RED (unlimited retries),
// /dailyred setup builds what it needs, /dailyred stop ends a battle. After 15 idle minutes the pane
// plays demo battles with random teams. See ../README.md.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { BattleState, Screen } from '../types'
import { chooseMove } from './autoplay'
import { dailySeed, today } from './seed'
import type { SpriteSheet } from './sprites'
import { parseSpriteSheet } from './sprites'
import { parseStateLine } from './state'
import { dayStreak, parseStats, recordAttempt, recordWin } from './stats'
import { renderScreen } from './view'

const PANE = 'dailyred'
const TITLE = 'DAILY RED'
const IDLE_MS = 15 * 60 * 1000
const STALL_MS = 10_000

const screen = atom({ plugin: 'dailyred-dash', key: 'screen' } as const, { kind: 'card', title: TITLE, lines: [], keys: [] } as Screen)
const footer = atom({ plugin: 'dailyred-dash', key: 'footer' } as const, '')

type Paths = { runner: string; rom: string; symbols: string; charmap: string; sprites: string; commands: string }
type Session = { stop: boolean; mode: 'daily' | 'demo'; date: string; counted: boolean; won: boolean }

// The module's own state; a reload starts it over (the stats live in $.store).
let session: Session | null = null
let latest: BattleState | null = null
let picking: 'moves' | 'party' = 'moves'
let seq = 0
let sheet: SpriteSheet | null = null
let lastInput = 0
let settingUp = false

async function paths($: EngineInterface): Promise<Paths> {
  const home = (await $.env.get('DAILYRED_HOME')) ?? `${await $.env.get('HOME')}/.claude/dailyred`
  return {
    runner: `${home}/bin/runner`, rom: `${home}/dailyred.gba`, symbols: `${home}/symbols.txt`,
    charmap: `${home}/charmap.txt`, sprites: `${home}/sprites.json`, commands: `${home}/commands`,
  }
}

async function send($: EngineInterface, command: string) {
  seq++
  await $.fs.write((await paths($)).commands, `${seq} ${command}\n`)
}

async function showFooter($: EngineInterface) {
  const stats = parseStats(await $.store.get('stats'))
  const date = today(new Date(await $.clock.now()))
  const d = stats.days[date]
  const text = `${d?.won ? 'beaten today' : 'today'}: attempt ${d?.attempts ?? 0} · day streak ${dayStreak(stats, date)}`
  await update($, footer, () => text)
}

async function card($: EngineInterface, lines: string[], keys: string[]) {
  await update($, screen, () => ({ kind: 'card', title: TITLE, lines, keys }) as Screen)
}

// Applies one runner state: counts the attempt once, records a win, drives a demo, updates the pane.
async function follow($: EngineInterface, s: Session, state: BattleState) {
  latest = state
  if (state.menu === 'party') picking = 'party'
  else if (state.menu !== 'action') picking = 'moves'
  if (s.mode === 'daily' && !s.counted && state.phase === 'battle') {
    s.counted = true
    await $.store.set('stats', recordAttempt(parseStats(await $.store.get('stats')), s.date))
    await showFooter($)
  }
  if (s.mode === 'daily' && state.result === 'won' && !s.won) {
    s.won = true
    await $.store.set('stats', recordWin(parseStats(await $.store.get('stats')), s.date))
    await showFooter($)
  }
  if (s.mode === 'demo' && state.player) {
    if (state.menu === 'action') {
      const slot = chooseMove(state.player, Math.random)
      if (slot !== null) await send($, `move ${slot}`)
    } else if (state.menu === 'party') {
      const next = state.party.find(p => p.hp > 0 && !p.active)
      if (next) await send($, `switch ${next.slot}`)
    }
  }
  if (s.mode === 'daily' && state.result !== 'none') {
    await card($, [state.result === 'won' ? 'You beat RED!' : 'Your team was wiped out.', 'Press r to try today\'s team again.'], ['r'])
    return
  }
  await update($, screen, () => ({ kind: 'battle', mode: s.mode, state, picking }) as Screen)
}

// One battle session: spawns the runner and follows its lines until it ends or is stopped.
async function play($: EngineInterface, mode: 'daily' | 'demo') {
  const p = await paths($)
  for (const file of [p.runner, p.rom, p.symbols, p.charmap]) {
    if (!(await $.fs.exists(file))) {
      await card($, ['Daily Red is not set up yet.', 'Run /dailyred setup (about 2 minutes, once).'], [])
      return
    }
  }
  if (!sheet && (await $.fs.exists(p.sprites))) sheet = parseSpriteSheet(await $.fs.read(p.sprites) as string)
  const date = today(new Date(await $.clock.now()))
  const seed = mode === 'daily' ? dailySeed(date) : 1 + Math.floor(Math.random() * 0xfffffffe)
  const mine: Session = { stop: false, mode, date, counted: false, won: false }
  if (session) session.stop = true
  session = mine
  latest = null
  picking = 'moves'
  await $.fs.write(p.commands, '')
  await card($, [mode === 'daily' ? 'Climbing to RED...' : 'DEMO'], [])
  const argv = [p.runner, '--rom', p.rom, '--symbols', p.symbols, '--charmap', p.charmap, '--seed', String(seed),
    '--commands', p.commands, ...(mode === 'daily' ? ['--daily'] : [])]
  let buffer = ''
  let lastLine = await $.clock.now()
  let error = ''
  const watchdog = $.clock.every(1000, async () => {
    if ((await $.clock.now()) - lastLine > STALL_MS) {
      mine.stop = true
      error = 'no response for 10 seconds'
    }
  })
  try {
    for await (const { stream, text } of $.process.spawn({ argv })) {
      if (mine.stop) break
      if (stream === 'stderr') {
        error = text.trim().split('\n').at(-1) ?? error
        continue
      }
      buffer += text
      let nl = buffer.indexOf('\n')
      while (nl >= 0) {
        const state = parseStateLine(buffer.slice(0, nl))
        buffer = buffer.slice(nl + 1)
        lastLine = await $.clock.now()
        if (state && !mine.stop) await follow($, mine, state)
        nl = buffer.indexOf('\n')
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  } finally {
    watchdog.cancel()
  }
  if (session !== mine) return
  session = null
  if (latest?.result === 'won' || latest?.result === 'lost') return
  if (!mine.stop || error) await card($, [`The game stopped${error ? `: ${error}` : '.'}`, 'Press r to try again.'], ['r'])
}

// A hotkey from the pane: acts only when the matching choice is open.
async function press($: EngineInterface, key: string) {
  lastInput = await $.clock.now()
  if (session?.mode === 'demo') {
    session.stop = true
    await card($, ['Demo stopped.', 'Press r to play today\'s team.'], ['r'])
    return
  }
  if (key === 'r') return void play($, 'daily')
  const state = latest
  if (!state || state.phase !== 'battle') return
  if (key === 'j' && state.menu === 'none') return send($, 'advance')
  if (key === 's' && state.menu === 'action') {
    picking = 'party'
    return update($, screen, () => ({ kind: 'battle', mode: 'daily', state, picking }) as Screen)
  }
  const n = Number(key)
  if (!Number.isInteger(n) || n < 1) return
  if (picking === 'party' || state.menu === 'party') {
    const target = state.party.find(p => p.slot === n)
    if (target && target.hp > 0 && !target.active) {
      picking = 'moves'
      return send($, `switch ${n}`)
    }
    return
  }
  const move = state.player?.moves.find(m => m.slot === n)
  if ((state.menu === 'action' || state.menu === 'move') && move && move.pp > 0) return send($, `move ${n}`)
}

// Runs setup.sh, showing its progress in the pane.
async function setup($: EngineInterface) {
  let last = ''
  settingUp = true
  try {
    await card($, ['Setting up Daily Red (about 2 minutes)...'], [])
    for await (const { text } of $.process.spawn({ argv: ['bash', `${$.plugin.root}/scripts/setup.sh`] })) {
      last = text.trim().split('\n').at(-1) ?? last
      await card($, ['Setting up Daily Red...', last], [])
    }
  } finally {
    settingUp = false
  }
  await card($, last.includes('DAILYRED-SETUP-OK') ? ['Ready.', 'Press r to play today\'s team.'] : ['Setup failed:', last], ['r'])
}

// Every minute: after 15 idle minutes with nothing running, a demo battle.
async function attract($: EngineInterface) {
  if (session || settingUp || (await $.clock.now()) - lastInput < IDLE_MS) return
  if (!(await $.ui.open({ id: PANE, title: TITLE })).isPlaced) return
  void play($, 'demo')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'dailyred', description: 'Battle RED with today\'s Daily Red team', argumentHint: '[setup|stop]' })
    lastInput = await $.clock.now()
    $.clock.every(60_000, () => void attract($))
    return next(e)
  })

  on('command.run', { command: 'dailyred' }, async ($, e) => {
    lastInput = await $.clock.now()
    const arg = (e.args ?? '').trim()
    if (arg === 'stop') {
      if (session) session.stop = true
      return { text: 'Daily Red stopped.' }
    }
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
    if (arg === 'setup') {
      if (session) session.stop = true
      void setup($)
      return { text: 'Daily Red setup started; progress is in the pane.' }
    }
    await showFooter($)
    void play($, 'daily')
    return { text: 'Daily Red: focus the pane (ctrl+x tab) — 1-4 moves, s switch, j next, r retry.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    return renderScreen(els, await read($, screen), await read($, footer), sheet, key => void press($, key))
  })
}
