// One runner stdout line → a BattleState, or null for anything that is not one.
import type { BattleState } from '../types'

const PHASES = ['exploring', 'battle', 'result', 'finished']
const MENUS = ['none', 'action', 'move', 'target', 'party']
const RESULTS = ['none', 'won', 'lost']

export function parseStateLine(line: string): BattleState | null {
  let v: Partial<BattleState>
  try {
    v = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof v !== 'object' || v === null) return null
  if (!PHASES.includes(v.phase as string) || !MENUS.includes(v.menu as string)) return null
  if (!RESULTS.includes(v.result as string) || typeof v.message !== 'string' || !Array.isArray(v.party)) return null
  return v as BattleState
}
