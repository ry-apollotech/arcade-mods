// The demo's player: the usable move with the best power x effectiveness, or a random usable one 20% of the time.
// With no PP left anywhere it picks 1: choosing FIGHT then makes the game use Struggle.
import type { Mon } from '../types'

const RANDOM_SHARE = 0.2

export function chooseMove(mon: Mon, random: () => number): number {
  const usable = mon.moves.filter(m => m.pp > 0)
  if (usable.length === 0) return 1
  const roll = random()
  if (roll < RANDOM_SHARE) return usable[Math.floor((roll / RANDOM_SHARE) * usable.length) % usable.length]!.slot
  return usable.reduce((best, m) => (m.power * m.effect > best.power * best.effect ? m : best)).slot
}
