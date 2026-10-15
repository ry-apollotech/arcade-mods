// Move animations: what happened between two runner states, and the 32x32 frames that show it.
// The effects are our own (the battle is read from memory, not the game's screen): a burst in the
// move type's colors over the target, a white flash and shake on a hit, and a sinking faint.
import type { BattleState, Mon } from '../types'

export type Grid = (number | null)[][]
export type Side = 'player' | 'enemy'
export type BattleEvent =
  | { kind: 'move'; target: Side; type: string }
  | { kind: 'hit'; target: Side }
  | { kind: 'faint'; target: Side }

const SIZE = 32
const WHITE = 0xffffff
const FRAMES = 8

// The game's own type names (six letters at most), each with its burst colors.
export const TYPE_COLORS: Record<string, number[]> = {
  NORMAL: [0xffffff, 0xd8d8c0], FIGHT: [0xc03028, 0xf08030], FLYING: [0xa890f0, 0xffffff],
  POISON: [0xa040a0, 0xd880d8], GROUND: [0xe0c068, 0x927d44], ROCK: [0xb8a038, 0x786824],
  BUG: [0xa8b820, 0xd8e070], GHOST: [0x705898, 0xb8a0e8], STEEL: [0xb8b8d0, 0xffffff],
  FIRE: [0xf08030, 0xf8d030, 0xe03010], WATER: [0x6890f0, 0xb8d8ff], GRASS: [0x78c850, 0xc0f090],
  ELECTR: [0xf8d030, 0xffffa0], PSYCHC: [0xf85888, 0xffb0c8], ICE: [0x98d8d8, 0xffffff],
  DRAGON: [0x7038f8, 0xb8a0ff], DARK: [0x705848, 0x403028],
}

type Pattern = 'rise' | 'fall' | 'zigzag' | 'ring' | 'star'
const PATTERNS: Record<string, Pattern> = {
  FIRE: 'rise', GRASS: 'rise', BUG: 'rise', WATER: 'fall', ICE: 'fall', ROCK: 'fall', GROUND: 'fall',
  ELECTR: 'zigzag', PSYCHC: 'ring', GHOST: 'ring', DARK: 'ring', DRAGON: 'ring', POISON: 'ring',
}

function copy(g: Grid): Grid {
  return g.map(row => [...row])
}

function put(g: Grid, x: number, y: number, color: number) {
  if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) g[y]![x] = color
}

// One frame of a burst: the pattern drawn over a copy of the sprite, `t` of FRAMES steps in.
function burstFrame(base: Grid, pattern: Pattern, palette: number[], t: number): Grid {
  const g = copy(base)
  const c = (i: number) => palette[i % palette.length]!
  if (pattern === 'rise' || pattern === 'fall') {
    for (let i = 0; i < 8; i++) {
      const x = 3 + i * 4
      const travel = (t * 4 + i * 5) % SIZE
      const y = pattern === 'rise' ? SIZE - 1 - travel : travel
      put(g, x, y, c(i))
      put(g, x, y + (pattern === 'rise' ? 1 : -1), c(i + 1))
    }
  } else if (pattern === 'zigzag') {
    if (t % 2 === 0) for (let y = 0; y < SIZE; y++) put(g, 16 + ((y >> 2) % 2 ? 3 : -3), y, c(y))
  } else if (pattern === 'ring') {
    const r = 2 + t * 2
    for (let a = 0; a < 32; a++) {
      const angle = (a / 32) * 2 * Math.PI
      put(g, Math.round(16 + r * Math.cos(angle)), Math.round(16 + r * Math.sin(angle)), c(a))
    }
  } else {
    const len = 2 + t * 2
    for (let d = 0; d < len; d++) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
        put(g, 16 + dx * d, 16 + dy * d, c(d))
      }
    }
  }
  return g
}

export function burstFrames(base: Grid, type: string): Grid[] {
  const palette = TYPE_COLORS[type] ?? [WHITE, 0xd8d8d8]
  const pattern = PATTERNS[type] ?? 'star'
  return Array.from({ length: FRAMES }, (_, t) => burstFrame(base, pattern, palette, t))
}

function shifted(base: Grid, dx: number, dy: number): Grid {
  return Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => base[y - dy]?.[x - dx] ?? null))
}

// A white flash, then a sideways shake.
export function hitFrames(base: Grid): Grid[] {
  const flash = base.map(row => row.map(c => (c === null ? null : WHITE)))
  return [flash, shifted(base, 2, 0), shifted(base, -2, 0), shifted(base, 2, 0), shifted(base, -2, 0), base]
}

// The sprite sinks out of its box.
export function faintFrames(base: Grid): Grid[] {
  return Array.from({ length: FRAMES }, (_, k) => shifted(base, 0, ((k + 1) * SIZE) / FRAMES))
}

const sameMon = (a: Mon | null, b: Mon | null) => a !== null && b !== null && a.species === b.species && a.name === b.name

// What changed from `prev` to `next`: a move announced, HP lost, a Pokémon fainting.
export function detectEvents(prev: BattleState | null, next: BattleState): BattleEvent[] {
  if (!prev || !next.player || !next.enemy) return []
  const events: BattleEvent[] = []
  const used = next.message !== prev.message ? / used (.+?)!/.exec(next.message) : null
  if (used) {
    const name = used[1]!.trim()
    const mine = next.player.moves.find(m => m.name === name)
    const theirs = next.enemy.moves.find(m => m.name === name)
    if (mine) events.push({ kind: 'move', target: 'enemy', type: mine.type })
    else if (theirs) events.push({ kind: 'move', target: 'player', type: theirs.type })
  }
  for (const side of ['player', 'enemy'] as const) {
    const before = prev[side]
    const after = next[side]
    if (!sameMon(before, after) || after!.hp >= before!.hp) continue
    events.push(after!.hp === 0 ? { kind: 'faint', target: side } : { kind: 'hit', target: side })
  }
  return events
}
