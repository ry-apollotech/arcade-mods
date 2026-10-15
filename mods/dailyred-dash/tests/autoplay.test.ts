import { describe, expect, test } from 'claude-code/testing'
import { chooseMove } from '../hooks/autoplay'
import { venusaur } from './fixtures'

describe('the demo autoplayer', () => {
  test('picks the hardest-hitting usable move', () => {
    expect(chooseMove(venusaur, () => 0.99)).toBe(1) // SOLARBEAM: 120 x 0.5; GIGA DRAIN has no PP
  })
  test('sometimes picks a random usable move, never one without PP', () => {
    const picks = new Set([0.0, 0.05, 0.1, 0.15].map(r => chooseMove(venusaur, () => r)))
    expect(picks.has(3)).toBe(false)
    expect([...picks].every(p => p === 1 || p === 2)).toBe(true)
  })
  test('no usable move: 1, which the game turns into Struggle', () => {
    expect(chooseMove({ ...venusaur, moves: venusaur.moves.map(m => ({ ...m, pp: 0 })) }, () => 0.5)).toBe(1)
  })
})
