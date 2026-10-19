// Token accounting for the fuel panel: totals from each model request's usage, the standing load
// from the context breakdown, and the report /fueldeck usage prints. Pure, like core.ts.
import type { Fuel, Load, LoadRow, SkillRun, TokenEntry, Tokens } from '../types'
import { kTokens, plural, prettyModel } from './core'

export const ZERO_TOKENS: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 }
export const DEFAULT_FUEL: Fuel = { total: ZERO_TOKENS, byWho: [], byModel: [], skills: [] }

type StepUsage = { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; output_tokens?: number } | null | undefined

/** One request added to a tally; a request whose response carried no usage still counts as one. */
export const addUsage = (t: Tokens, u: StepUsage): Tokens => ({
  input: t.input + (u?.input_tokens ?? 0),
  output: t.output + (u?.output_tokens ?? 0),
  cacheRead: t.cacheRead + (u?.cache_read_input_tokens ?? 0),
  cacheWrite: t.cacheWrite + (u?.cache_creation_input_tokens ?? 0),
  requests: t.requests + 1,
})

/** Every token the requests processed: input, cache reads and writes, and output. */
export const sumOf = (t: Tokens) => t.input + t.output + t.cacheRead + t.cacheWrite

/** Cache reads as a whole percentage of all input; null before any input. */
export const cacheHit = (t: Tokens) => {
  const input = t.input + t.cacheRead + t.cacheWrite
  return input > 0 ? Math.round((100 * t.cacheRead) / input) : null
}

const bump = (list: TokenEntry[], key: string, u: StepUsage): TokenEntry[] =>
  list.some(e => e.key === key)
    ? list.map(e => (e.key === key ? { ...e, tokens: addUsage(e.tokens, u) } : e))
    : [...list, { key, tokens: addUsage(ZERO_TOKENS, u) }]

export const applyFuel = (f: Fuel, s: { who: string; model: string; usage: StepUsage }): Fuel => ({
  ...f,
  total: addUsage(f.total, s.usage),
  byWho: bump(f.byWho, s.who, s.usage),
  byModel: bump(f.byModel, s.model, s.usage),
})

/** A rough count for text no API measured: about four characters a token. */
export const estTokens = (text: string) => Math.ceil(text.length / 4)

export const noteSkill = (f: Fuel, r: { name: string; plugin: string | null; text: string }): Fuel => {
  const tokens = estTokens(r.text)
  const skills: SkillRun[] = f.skills.some(s => s.name === r.name)
    ? f.skills.map(s => (s.name === r.name ? { ...s, runs: s.runs + 1, tokens: s.tokens + tokens } : s))
    : [...f.skills, { name: r.name, plugin: r.plugin, runs: 1, tokens }]
  return { ...f, skills }
}

export const ranked = (list: TokenEntry[]) => [...list].sort((a, b) => sumOf(b.tokens) - sumOf(a.tokens))

/** Reads leniently: a value saved under an older or broken shape falls back to empty. */
export const normalizeFuel = (stored: unknown): Fuel => {
  const f = (stored ?? {}) as Partial<Fuel>
  const list = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : [])
  return {
    total: { ...ZERO_TOKENS, ...(f.total ?? {}) },
    byWho: list<TokenEntry>(f.byWho),
    byModel: list<TokenEntry>(f.byModel),
    skills: list<SkillRun>(f.skills),
  }
}

// ---------------------------------------------------------------- standing load

type BreakdownLike = {
  totalTokens: number
  rawMaxTokens: number
  categories: readonly { name: string; tokens: number; kind: string }[]
  skills?: { skillFrontmatter: readonly { name: string; source: string; pluginName?: string; tokens: number }[] }
  agents: readonly { agentType: string; source: string; tokens: number }[]
  mcpTools: readonly { serverName: string; tokens: number; isLoaded: boolean }[]
  memoryFiles: readonly { tokens: number }[]
}

type Group = { label: string; kind: LoadRow['kind']; tokens: number; counts: Record<string, number> }

/**
 * What every request carries, by where it comes from: a plugin's skills and agents together, each
 * MCP server's loaded schemas, the memory files, and skills or agents of no plugin by their source.
 */
export const loadOf = (b: BreakdownLike, at: number): Load => {
  const groups = new Map<string, Group>()
  const add = (id: string, label: string, kind: LoadRow['kind'], tokens: number, noun: string) => {
    const g = groups.get(id) ?? { label, kind, tokens: 0, counts: {} }
    groups.set(id, { ...g, tokens: g.tokens + tokens, counts: { ...g.counts, [noun]: (g.counts[noun] ?? 0) + 1 } })
  }
  for (const s of b.skills?.skillFrontmatter ?? []) {
    if (s.pluginName) add(`plugin:${s.pluginName}`, s.pluginName, 'plugin', s.tokens, 'skill')
    else add(`skills:${s.source}`, `${s.source} skills`, 'skills', s.tokens, 'skill')
  }
  for (const a of b.agents) {
    // A plugin's agent is named `<plugin>:<agent>`.
    const plugin = a.source === 'plugin' && a.agentType.includes(':') ? a.agentType.split(':')[0] : null
    if (plugin) add(`plugin:${plugin}`, plugin, 'plugin', a.tokens, 'agent')
    else add(`agents:${a.source}`, `${a.source} agents`, 'agents', a.tokens, 'agent')
  }
  for (const t of b.mcpTools) if (t.isLoaded) add(`mcp:${t.serverName}`, t.serverName, 'mcp', t.tokens, 'tool')
  for (const m of b.memoryFiles) add('memory', 'memory files', 'memory', m.tokens, 'file')
  const rows = [...groups.values()]
    .map(g => ({
      label: g.label,
      kind: g.kind,
      tokens: g.tokens,
      detail: Object.entries(g.counts)
        .map(([noun, n]) => plural(n, noun))
        .join(' · '),
    }))
    .sort((x, y) => y.tokens - x.tokens)
  const categories = b.categories
    .filter(c => c.kind === 'used')
    .map(c => ({ name: c.name, tokens: c.tokens }))
    .sort((x, y) => y.tokens - x.tokens)
  const sources = rows.reduce((n, r) => n + r.tokens, 0)
  return { at, total: b.totalTokens, sources, max: b.rawMaxTokens, rows, categories }
}

// ---------------------------------------------------------------- report

const table = (rows: [string, string, string][]) => {
  const w0 = Math.max(...rows.map(r => r[0].length))
  const w1 = Math.max(...rows.map(r => r[1].length))
  return rows.map(([a, b, c]) => `  ${a.padEnd(w0)}  ${b.padStart(w1)}  ${c}`.trimEnd()).join('\n')
}

const tokenLine = (t: Tokens) => `${t.requests} req · in ${kTokens(t.input)} · out ${kTokens(t.output)} · cache ${kTokens(t.cacheRead)} read / ${kTokens(t.cacheWrite)} write`

/** The full picture as text, for /fueldeck usage. */
export const usageReport = (f: Fuel, load: Load | null, costUsd: number | null): string => {
  const parts: string[] = []
  if (f.total.requests === 0) parts.push('Tokens: no model requests yet.')
  else {
    const hit = cacheHit(f.total)
    const cost = costUsd !== null ? ` · $${costUsd.toFixed(2)}` : ''
    parts.push(`Tokens: ${kTokens(sumOf(f.total))} tokens over ${plural(f.total.requests, 'request')}${cost}`)
    parts.push(`  in ${kTokens(f.total.input)} · out ${kTokens(f.total.output)} · cache ${kTokens(f.total.cacheRead)} read / ${kTokens(f.total.cacheWrite)} write${hit !== null ? ` · cache hit ${hit}%` : ''}`)
    parts.push('', 'By loop:', table(ranked(f.byWho).map(e => [e.key, kTokens(sumOf(e.tokens)), tokenLine(e.tokens)])))
    parts.push('', 'By model:', table(ranked(f.byModel).map(e => [prettyModel(e.key), kTokens(sumOf(e.tokens)), tokenLine(e.tokens)])))
  }
  if (load) {
    parts.push('', `Context now ~${kTokens(load.total)} of ${kTokens(load.max)} (estimated, as /context counts):`)
    if (load.categories.length > 0) parts.push(table(load.categories.map(c => [c.name, kTokens(c.tokens), ''])))
    if (load.rows.length > 0) parts.push('', `Every request carries ~${kTokens(load.sources)} from plugins, MCP servers and memory:`, table(load.rows.map(r => [r.label, kTokens(r.tokens), r.detail])))
  }
  if (f.skills.length > 0) {
    const runs = [...f.skills].sort((a, b) => b.tokens - a.tokens)
    parts.push('', 'Skills run (injected text, estimated):', table(runs.map(s => [s.plugin ? `${s.name} (${s.plugin})` : s.name, `×${s.runs}`, `~${kTokens(s.tokens)}`])))
  }
  return parts.join('\n')
}
