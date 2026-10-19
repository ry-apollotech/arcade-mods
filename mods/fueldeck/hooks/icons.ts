// The glyphs the `icons` labels draw beside a short word, all single-width (no emoji, which most
// terminals draw two columns wide and which would break the boxes), and the legend that explains them.
import type { Receipt } from '../types'
import { fmtDuration, fmtUsd, plural } from './core'

export const ICON = {
  context: '◔',
  speed: '⌁',
  tokens: 'Σ',
  hit: '◎',
  input: '↓',
  output: '↑',
  load: '☰',
  skill: '◇',
  edit: '✎',
  error: '✗',
  gate: '⚑',
  reset: '→',
} as const

/** A request's speed in short words: `⌁ 1st token 0.8s · 60 tok/s`. */
export const fmtSpeedIcon = (s: { ttftMs: number; tokPerS: number | null }) =>
  `${ICON.speed} 1st token ${(s.ttftMs / 1000).toFixed(1)}s${s.tokPerS !== null ? ` · ${Math.round(s.tokPerS)} tok/s` : ''}`

/**
 * `n word` for each count above zero, joined: what is zero says nothing and takes no room. Nouns
 * (`edit`) take a plural; `isNoun: false` keeps a word as given (`3 allowed`).
 */
export const counts = (parts: [number, string][], isNoun = true) =>
  parts
    .filter(([n]) => n > 0)
    .map(([n, word]) => (isNoun ? plural(n, word) : `${n} ${word}`))
    .join(' · ')

/** The last turn: its time, then only the counts that happened, then the cost it added. */
export const receiptIcons = (r: Receipt) =>
  [
    `last turn ${fmtDuration(r.durationMs)}`,
    counts([
      [r.agents, 'agent'],
      [r.edits, 'edit'],
      [r.errors, 'error'],
    ]),
    r.costDelta !== null ? `+${fmtUsd(r.costDelta)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

export const LEGEND = [
  'Fueldeck icons',
  `  ${ICON.context}  context window        ⟲  compactions        ${ICON.reset}  time to a rate-limit reset`,
  `  ${ICON.speed}  last request: time to its first token, then output tokens per second`,
  '  ▮▮▯▯  effort',
  `  ${ICON.tokens}  tokens this session    ${ICON.hit}  share read from the cache    ${ICON.input} ${ICON.output}  fresh input / output`,
  `  ${ICON.load}  what every request carries, by plugin and source`,
  `  ${ICON.skill}  skills that ran, with about how much text each added`,
  `  ${ICON.gate}  permission checks: green allowed by a rule, blue cleared by the classifier or you,`,
  `     amber pending, ${ICON.error} denied; dim when inside a subagent`,
  '  f s o  checks by family: file, shell, other; press the letter to list them',
  `  ✓  last turn ended    ${ICON.edit}  edits    +$  cost the turn added`,
  '',
  'Counts that are zero are hidden. Set labels to "words" in /config for the full labelled layout.',
].join('\n')
