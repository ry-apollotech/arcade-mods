import type { BattleState, Mon } from '../types'

export const venusaur: Mon = {
  species: 3, name: 'VENUSAUR', level: 100, hp: 301, maxHp: 364, types: ['GRASS', 'POISON'],
  moves: [
    { slot: 1, id: 76, name: 'SOLARBEAM', pp: 10, maxPp: 10, power: 120, type: 'GRASS', effect: 5 },
    { slot: 2, id: 79, name: 'SLEEP POWDER', pp: 15, maxPp: 15, power: 0, type: 'GRASS', effect: 5 },
    { slot: 3, id: 202, name: 'GIGA DRAIN', pp: 0, maxPp: 5, power: 60, type: 'GRASS', effect: 5 },
  ],
}
export const charizard: Mon = {
  species: 6, name: 'CHARIZARD', level: 100, hp: 241, maxHp: 360, types: ['FIRE', 'FLYING'],
  moves: [{ slot: 1, id: 53, name: 'FLAMETHROWER', pp: 15, maxPp: 15, power: 95, type: 'FIRE', effect: 20 }],
}
export const atAction: BattleState = {
  phase: 'battle', menu: 'action', result: 'none', message: 'What will VENUSAUR do?',
  player: venusaur, enemy: charizard,
  party: [
    { slot: 1, species: 3, name: 'VENUSAUR', level: 100, hp: 301, maxHp: 364, active: true },
    { slot: 2, species: 9, name: 'BLASTOISE', level: 100, hp: 0, maxHp: 362, active: false },
    { slot: 3, species: 65, name: 'ALAKAZAM', level: 100, hp: 251, maxHp: 251, active: false },
  ],
}
