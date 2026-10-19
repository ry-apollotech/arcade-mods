// The glyphs the `icons` labels draw in place of words, all single-width (no emoji, which most
// terminals draw two columns wide and which would break the boxes), and the legend that explains them.
import type { Receipt } from '../types'
import { fmtDuration, fmtUsd } from './core'

export const ICON = {
  context: '◔',
  speed: '⌁',
  tokens: 'Σ',
  hit: '◎',
  input: '↓',
  output: '↑',
  load: '☰',
  skill: '◇',
  agent: '◈',
  tool: '⎔',
  file: '▤',
  edit: '✎',
  error: '✗',
  gate: '⚑',
  requests: '×',
} as const

/** `2 skills · 1 agent` as `2◇ 1◈`; a noun with no glyph keeps its word. */
export const iconDetail = (detail: string) =>
  detail.replace(/(\d+) (skill|agent|tool|file)s?/g, (_, n: string, noun: keyof typeof ICON) => `${n}${ICON[noun]}`).replace(/ · /g, ' ')

/** A request's speed without its labels: `⌁ 0.8s · 60/s`. */
export const fmtSpeedIcon = (s: { ttftMs: number; tokPerS: number | null }) =>
  `${ICON.speed} ${(s.ttftMs / 1000).toFixed(1)}s${s.tokPerS !== null ? ` · ${Math.round(s.tokPerS)}/s` : ''}`

/** `icon + n` for each count above zero, joined: what is zero says nothing and takes no room. */
export const nonZero = (parts: [string, number][]) =>
  parts
    .filter(([, n]) => n > 0)
    .map(([icon, n]) => `${icon}${n}`)
    .join(' · ')

/** The last turn in icons: its time, then only the counts that happened, then the cost it added. */
export const receiptIcons = (r: Receipt) =>
  [
    fmtDuration(r.durationMs),
    nonZero([
      [ICON.agent, r.agents],
      [ICON.edit, r.edits],
      [ICON.error, r.errors],
    ]),
    r.costDelta !== null ? `+${fmtUsd(r.costDelta)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

export const LEGEND = [
  'Fueldeck icons',
  `  ${ICON.context}  context window        ⟲  compactions        ↻  time to a rate-limit reset`,
  `  ${ICON.speed}  last request: time to first token · output tokens per second`,
  `  ${ICON.requests}  requests              ▮▮▯▯  effort`,
  `  ${ICON.tokens}  tokens this session    ${ICON.hit}  cache hit rate    ${ICON.input} ${ICON.output}  fresh input / output tokens`,
  `  ${ICON.load}  what every request carries, by plugin and source`,
  `  ${ICON.skill}  skills    ${ICON.agent}  agents    ${ICON.tool}  MCP tools    ${ICON.file}  memory files`,
  `  ${ICON.gate}  permission checks: green allowed by a rule, blue cleared by the classifier or you,`,
  `     amber pending, ${ICON.error} denied; dim when inside a subagent`,
  `     (on one line above the prompt: ✓ allowed  ◆ cleared  … pending  ${ICON.error} denied)`,
  `  ✓  last turn ended    ${ICON.edit}  edits    ${ICON.error}  errors    +$  cost the turn added`,
  '',
  'Counts that are zero are hidden. Set labels to "words" in /config for the labelled layout.',
].join('\n')
