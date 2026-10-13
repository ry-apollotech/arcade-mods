import { describe, expect, test } from 'claude-code/testing'
import { parseStateLine } from '../hooks/state'
import { atAction } from './fixtures'

describe('reading a runner line', () => {
  test('a valid line becomes a state', () => {
    expect(parseStateLine(JSON.stringify(atAction))).toEqual(atAction)
  })
  test('a line outside a battle has no Pokémon', () => {
    const line = '{"phase":"exploring","menu":"none","result":"none","message":"","player":null,"enemy":null,"party":[]}'
    expect(parseStateLine(line)?.player).toBeNull()
  })
  test('broken or foreign lines are refused', () => {
    expect(parseStateLine('not json')).toBeNull()
    expect(parseStateLine('{"phase":"lunch"}')).toBeNull()
    expect(parseStateLine(JSON.stringify({ ...atAction, menu: 'bag' }))).toBeNull()
  })
})
