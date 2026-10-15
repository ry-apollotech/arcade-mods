import { describe, expect, test } from 'claude-code/testing'
import { dayStreak, dropAttempt, EMPTY_STATS, parseStats, previousDay, recordAttempt, recordWin } from '../hooks/stats'

describe('per-day stats', () => {
  test('counts attempts and a win for the day the attempt started', () => {
    let s = recordAttempt(EMPTY_STATS, '2026-10-11')
    s = recordAttempt(s, '2026-10-11')
    // The battle began on the 11th and ended after midnight: the win still belongs to the 11th.
    s = recordWin(s, '2026-10-11')
    expect(s.days['2026-10-11']).toEqual({ attempts: 2, won: true })
    expect(s.days['2026-10-12']).toBeUndefined()
  })
  test('does not change the stats it was given', () => {
    recordAttempt(EMPTY_STATS, '2026-10-11')
    expect(EMPTY_STATS.days).toEqual({})
  })
  test('the streak counts won days back from today, or from yesterday before today is won', () => {
    let s = EMPTY_STATS
    for (const d of ['2026-10-08', '2026-10-09', '2026-10-10']) s = recordWin(recordAttempt(s, d), d)
    expect(dayStreak(s, '2026-10-10')).toBe(3)
    expect(dayStreak(s, '2026-10-11')).toBe(3)
    expect(dayStreak(recordAttempt(s, '2026-10-11'), '2026-10-11')).toBe(3)
    expect(dayStreak(s, '2026-10-12')).toBe(0)
  })
  test('a lost day breaks the streak', () => {
    let s = recordWin(recordAttempt(EMPTY_STATS, '2026-10-09'), '2026-10-09')
    s = recordAttempt(s, '2026-10-10')
    expect(dayStreak(s, '2026-10-11')).toBe(0)
  })
  test('a dropped attempt is taken back, never below zero', () => {
    const s = recordAttempt(recordAttempt(EMPTY_STATS, '2026-10-11'), '2026-10-11')
    expect(dropAttempt(s, '2026-10-11').days['2026-10-11']!.attempts).toBe(1)
    expect(dropAttempt(EMPTY_STATS, '2026-10-11').days['2026-10-11']?.attempts ?? 0).toBe(0)
  })
  test('previous day crosses months and years', () => {
    expect(previousDay('2026-03-01')).toBe('2026-02-28')
    expect(previousDay('2026-01-01')).toBe('2025-12-31')
  })
  test('junk in the store reads as empty stats', () => {
    expect(parseStats(undefined)).toEqual(EMPTY_STATS)
    expect(parseStats({ days: { '2026-10-11': { attempts: 'x' } } })).toEqual(EMPTY_STATS)
  })
})
