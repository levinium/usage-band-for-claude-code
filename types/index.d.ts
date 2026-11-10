export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** One piece of background work the session is waiting on. */
export type WaitingItem = {
  id: string
  /** 'shell', 'subagent', 'monitor', 'workflow', 'scheduled', or the engine's own word. */
  kind: string
  /** What it is, one line: the description, the command, the workflow name. */
  label: string
  /** When it started (or was first seen), ms since the epoch. */
  since: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      limits: Limit[]
      contextPercent: number | null
      isCompacting: boolean
      waiting: WaitingItem[]
      tick: number
    }
  }
}
