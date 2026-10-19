export type MoveInfo = { slot: number; id: number; name: string; pp: number; maxPp: number; power: number; type: string; effect: number }
// A status condition as the game's badge: '' for none, else SLP, PSN, TOX (badly poisoned), BRN, FRZ or PAR.
export type Status = '' | 'SLP' | 'PSN' | 'TOX' | 'BRN' | 'FRZ' | 'PAR'
// item: the held item's name as the game spells it (CHARCOAL), '' for none; absent from an older runner.
export type Mon = {
  species: number; name: string; level: number; hp: number; maxHp: number; types: string[]; moves: MoveInfo[]
  status?: Status; confused?: boolean; item?: string
}
export type PartyMon = { slot: number; species: number; name: string; level: number; hp: number; maxHp: number; active: boolean; status?: Status; item?: string }
export type Phase = 'exploring' | 'battle' | 'result' | 'finished'
export type Menu = 'none' | 'action' | 'move' | 'target' | 'party'
export type BattleState = {
  phase: Phase
  menu: Menu
  result: 'none' | 'won' | 'lost'
  message: string
  player: Mon | null
  enemy: Mon | null
  party: PartyMon[]
}
// What the pane shows: a card (setup needed, starting, an error, a result) or a battle.
export type Screen =
  | { kind: 'card'; title: string; lines: string[]; keys: string[] }
  | { kind: 'battle'; mode: 'daily' | 'demo'; state: BattleState; picking: 'moves' | 'party' }

declare module 'claude-code' {
  interface PluginState {
    'dailyred-dash': { screen: Screen; footer: string }
  }
}
