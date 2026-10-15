import { describe, expect, test } from 'claude-code/testing'
import { attemptSeed, dailySeed, today } from '../hooks/seed'

describe('the daily seed', () => {
  // Values from dailyred's own web/daily.js for the same dates.
  test('matches dailyred for known dates', () => {
    expect(dailySeed('2026-10-11')).toBe(4075659768)
    expect(dailySeed('2026-10-12')).toBe(4125992625)
    expect(dailySeed('2026-01-01')).toBe(886997947)
  })
  test('the first attempt is today\'s shared team; every retry gets a new team', () => {
    expect(attemptSeed('2026-10-11', 1)).toBe(dailySeed('2026-10-11'))
    const seeds = new Set([1, 2, 3, 4].map(n => attemptSeed('2026-10-11', n)))
    expect(seeds.size).toBe(4)
    expect(attemptSeed('2026-10-11', 2)).toBe(attemptSeed('2026-10-11', 2)) // same retry, same team, for anyone
  })
  test('today is the local calendar date', () => {
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
