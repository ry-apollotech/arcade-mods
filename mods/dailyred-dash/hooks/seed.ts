// The day's team seed, exactly as dailyred's web/daily.js computes it, so the team matches the website.

// A date in the local time zone, e.g. "2026-10-11".
export function today(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// FNV-1a of "dailyred:<date>", never 0.
export function dailySeed(date: string): number {
  let hash = 0x811c9dc5
  for (const ch of `dailyred:${date}`) {
    hash ^= ch.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash || 1
}
