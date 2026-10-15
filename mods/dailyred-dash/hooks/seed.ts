// The day's team seed, exactly as dailyred's web/daily.js computes it, so the team matches the website.

// A date in the local time zone, e.g. "2026-10-11".
export function today(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// FNV-1a of a text, never 0.
function fnv(text: string): number {
  let hash = 0x811c9dc5
  for (const ch of text) {
    hash ^= ch.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash || 1
}

// FNV-1a of "dailyred:<date>": the website's team for the day.
export function dailySeed(date: string): number {
  return fnv(`dailyred:${date}`)
}

// Attempt 1 is the day's shared team; each retry gets a new team, the same one for anyone on that retry.
export function attemptSeed(date: string, attempt: number): number {
  return attempt <= 1 ? dailySeed(date) : fnv(`dailyred:${date}:${attempt}`)
}
