import { describe, expect, test } from 'claude-code/testing'
import { burstFrames, detectEvents, faintFrames, hitFrames, TYPE_COLORS } from '../hooks/effects'
import type { Grid } from '../hooks/effects'
import { atAction, charizard, venusaur } from './fixtures'

const RED = 0xff0000
// A 32x32 sprite: a red 16x16 square in the middle, transparent around it.
const base: Grid = Array.from({ length: 32 }, (_, y) => Array.from({ length: 32 }, (_, x) => (x >= 8 && x < 24 && y >= 8 && y < 24 ? RED : null)))
const colors = (g: Grid) => new Set(g.flat().filter((c): c is number => c !== null))

describe('effect frames', () => {
  test('a burst is several 32x32 frames in the move type\'s colors over the sprite', () => {
    const frames = burstFrames(base, 'FIRE')
    expect(frames.length).toBeGreaterThanOrEqual(6)
    for (const f of frames) {
      expect(f.length).toBe(32)
      expect(f.every(row => row.length === 32)).toBe(true)
    }
    expect(frames.some(f => TYPE_COLORS.FIRE!.some(c => colors(f).has(c)))).toBe(true)
    expect(frames.some(f => colors(f).has(RED))).toBe(true) // the sprite still shows under it
  })
  test('an unknown type bursts in white', () => {
    expect(burstFrames(base, '???').some(f => colors(f).has(0xffffff))).toBe(true)
  })
  test('a hit flashes the sprite white and shakes it sideways', () => {
    const frames = hitFrames(base)
    expect(colors(frames[0]!)).toEqual(new Set([0xffffff]))
    const firstColumn = (g: Grid) => g[16]!.findIndex(c => c !== null)
    expect(new Set(frames.map(firstColumn)).size).toBeGreaterThan(1)
  })
  test('a faint sinks the sprite until nothing is left', () => {
    const frames = faintFrames(base)
    expect(frames.at(-1)!.flat().every(c => c === null)).toBe(true)
  })
})

describe('reading what happened between two states', () => {
  test('the player\'s move: a burst on the enemy, in the move\'s type', () => {
    const next = { ...atAction, menu: 'none' as const, message: 'VENUSAUR used SOLARBEAM!' }
    expect(detectEvents(atAction, next)).toContainEqual({ kind: 'move', target: 'enemy', type: 'GRASS' })
  })
  test('the enemy\'s move: a burst on the player', () => {
    const next = { ...atAction, menu: 'none' as const, message: 'Foe CHARIZARD used FLAMETHROWER!' }
    expect(detectEvents(atAction, next)).toContainEqual({ kind: 'move', target: 'player', type: 'FIRE' })
  })
  test('lost HP is a hit; HP reaching 0 is a faint', () => {
    const hurt = { ...atAction, enemy: { ...charizard, hp: 100 } }
    expect(detectEvents(atAction, hurt)).toContainEqual({ kind: 'hit', target: 'enemy' })
    const fainted = { ...atAction, enemy: { ...charizard, hp: 0 } }
    expect(detectEvents(atAction, fainted)).toContainEqual({ kind: 'faint', target: 'enemy' })
  })
  test('the same message twice, or a new Pokémon coming out, plays nothing', () => {
    const next = { ...atAction, menu: 'none' as const, message: 'VENUSAUR used SOLARBEAM!' }
    expect(detectEvents(next, next)).toEqual([])
    const switched = { ...atAction, player: { ...venusaur, species: 9, name: 'BLASTOISE', hp: 10 } }
    expect(detectEvents(atAction, switched)).toEqual([])
  })
})
