export type GitInfo = { branch: string; commit: string; dirty: number; checkedAt: string }
export type E2ERun = {
  state: 'idle' | 'running' | 'passed' | 'failed'
  scope: string
  progress: string
  summary: string
  failures: string[]
  at: string
}

declare module 'claude-code' {
  interface PluginState {
    'garage-kerja': {
      skills: Shaped<string[]>
      git: Shaped<GitInfo | null>
      e2e: Shaped<E2ERun>
      blocked: Shaped<string[]>
    }
  }
}
