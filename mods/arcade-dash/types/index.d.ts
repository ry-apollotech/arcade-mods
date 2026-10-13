export type Score = { passed: number | null; total: number | null; isClear: boolean }
export type Git = { branch: string; dirty: number; unpushed: number }

declare module 'claude-code' {
  interface PluginState {
    'arcade-dash': {
      score: Score | null
      git: Git | null
      lastTurnSeconds: number | null
      isAwake: boolean
    }
  }
}
