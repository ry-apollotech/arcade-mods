// Per-day stats: attempts at RED and whether he was beaten, and the streak of days won.
export type DayRecord = { attempts: number; won: boolean }
export type Stats = { days: Record<string, DayRecord> }

export const EMPTY_STATS: Stats = { days: {} }

export function parseStats(value: unknown): Stats {
  const days = (value as { days?: unknown } | undefined)?.days
  if (typeof days !== 'object' || days === null) return EMPTY_STATS
  const entries = Object.entries(days as Record<string, unknown>)
  const valid = entries.every(([date, r]) => /^\d{4}-\d{2}-\d{2}$/.test(date)
    && typeof (r as DayRecord)?.attempts === 'number' && typeof (r as DayRecord)?.won === 'boolean')
  return valid ? { days: Object.fromEntries(entries) as Record<string, DayRecord> } : EMPTY_STATS
}

function day(stats: Stats, date: string): DayRecord {
  return stats.days[date] ?? { attempts: 0, won: false }
}

export function recordAttempt(stats: Stats, date: string): Stats {
  const d = day(stats, date)
  return { days: { ...stats.days, [date]: { ...d, attempts: d.attempts + 1 } } }
}

// `date` is the day the attempt started, so a battle won after midnight counts for its own day.
export function recordWin(stats: Stats, date: string): Stats {
  return { days: { ...stats.days, [date]: { ...day(stats, date), won: true } } }
}

export function previousDay(date: string): string {
  const d = new Date(`${date}T12:00:00`) // midday, so a DST change cannot skip a day
  d.setDate(d.getDate() - 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Days won in a row, ending today, or yesterday while today is not won yet.
export function dayStreak(stats: Stats, today: string): number {
  let date = stats.days[today]?.won ? today : previousDay(today)
  let streak = 0
  while (stats.days[date]?.won) {
    streak++
    date = previousDay(date)
  }
  return streak
}
