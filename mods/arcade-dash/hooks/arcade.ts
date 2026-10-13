import type { Score } from '../types'

export const COLORS = {
  red: '#ff4a4a',
  green: '#3ee06e',
  yellow: '#ffd23f',
  cyan: '#4ad8ff',
  pink: '#ff6ad5',
  dim: '#7c7ca8',
} as const

const TEST_COMMAND = /\b(gradlew?|mvnw?|npm|pnpm|yarn|go)\b[^\n]*\btest|\bpytest\b/i
const GRADLE_COUNTS = /(\d+) tests? completed, (\d+) failed/
const MAVEN_COUNTS = /Tests run: (\d+), Failures: (\d+), Errors: (\d+)/g

export function isTestCommand(command: string): boolean {
  return TEST_COMMAND.test(command)
}

// Reads pass/fail counts from Gradle or Maven output; counts stay null when the tool didn't print them.
export function parseScore(output: string, isError: boolean): Score {
  const gradle = GRADLE_COUNTS.exec(output)
  if (gradle) {
    const total = Number(gradle[1])
    const failed = Number(gradle[2])
    return { passed: total - failed, total, isClear: failed === 0 && !isError }
  }
  const maven = [...output.matchAll(MAVEN_COUNTS)].at(-1)
  if (maven) {
    const total = Number(maven[1])
    const failed = Number(maven[2]) + Number(maven[3])
    return { passed: total - failed, total, isClear: failed === 0 && !isError }
  }
  return { passed: null, total: null, isClear: !isError }
}

export function scoreText(score: Score): string {
  const counts = score.total === null ? '' : ` ${score.passed}/${score.total}`
  return score.isClear ? `CLEAR${counts}` : `MISS${counts}`
}

const TAGS: Record<string, string> = {
  Read: 'READ',
  Edit: 'EDIT',
  MultiEdit: 'EDIT',
  Write: 'WRITE',
  Grep: 'FIND',
  Glob: 'FILES',
  Agent: 'AGENT',
  Task: 'AGENT',
  WebFetch: 'WEB',
  WebSearch: 'SEARCH',
  TodoWrite: 'TODO',
  Skill: 'SKILL',
}

function field(input: unknown, name: string): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const value = (input as Record<string, unknown>)[name]
  return typeof value === 'string' ? value : undefined
}

export function shortPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length <= 3 ? parts.join('/') : parts.slice(-3).join('/')
}

export function toolTag(tool: string, input: unknown): string {
  if (tool === 'Bash') {
    const command = field(input, 'command') ?? ''
    if (/\bgradlew?\b/.test(command)) return 'GRADLE'
    if (/\bmvnw?\b/.test(command)) return 'MAVEN'
    if (/^\s*git\b/.test(command)) return 'GIT'
    return 'BASH'
  }
  const tag = TAGS[tool]
  if (tag !== undefined) return tag
  const name = tool.startsWith('mcp__') ? tool.split('__').at(-1) ?? tool : tool
  return name.toUpperCase().slice(0, 8)
}

export function toolArg(tool: string, input: unknown): string {
  const command = field(input, 'command')
  if (command !== undefined) return (command.split('\n')[0] ?? '').replace(/^\.\/gradlew\s+/, '')
  const path = field(input, 'file_path') ?? field(input, 'path') ?? field(input, 'notebook_path')
  if (path !== undefined) return shortPath(path)
  return field(input, 'pattern') ?? field(input, 'description') ?? field(input, 'url') ?? field(input, 'query') ?? ''
}

// Context left as a 10-cell bar, e.g. 38% used -> "██████░░░░".
export function energyBar(percentUsed: number): { full: string; empty: string; left: number } {
  const left = Math.max(0, Math.min(100, 100 - percentUsed))
  const cells = Math.round(left / 10)
  return { full: '█'.repeat(cells), empty: '░'.repeat(10 - cells), left }
}

export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export const SPINNER_WORDS: Record<string, string> = {
  thinking: 'THINKING',
  requesting: 'LOADING',
  responding: 'TYPING',
  'tool-input': 'LOADING',
  'tool-use': 'RUNNING',
}
