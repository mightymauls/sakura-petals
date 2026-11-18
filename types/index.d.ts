declare module 'claude-code' {
  interface PluginState {
    'sakura-petals': {
      /** When this session first loaded the mod, ms since the epoch. */
      startedAt: number
      /** Seconds since startedAt, as of the last tick; the backdrop draws from it. */
      elapsed: number
    }
  }
}

export type Seconds = number
