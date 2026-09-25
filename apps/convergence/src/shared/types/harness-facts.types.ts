export type HarnessOutput =
  | string
  | { truncated: true; bytes: number; preview: string }

export type HarnessFact = {
  at: string
  truncated?: true
  fieldBounds?: Record<string, { truncated: true; bytes: number }>
} & (
  | {
      kind: 'harness.hook'
      hookId: string | null
      hookName: string | null
      hookEvent: string | null
      phase: 'started' | 'progress' | 'response' | 'unknown'
      status: 'ok' | 'failed' | 'blocked' | 'cancelled' | null
      output: HarnessOutput | null
    }
  | {
      kind: 'harness.retry'
      phase: 'attempt'
      attempt: number | null
      maxRetries: number | null
      retryDelayMs: number | null
      errorStatus: number | null
      message: string | null
      noResponse: boolean | null
    }
  | {
      kind: 'harness.retry'
      phase: 'resolved'
      outcome: 'succeeded' | 'failed' | 'unknown'
      reason?: 'tool-error-while-outstanding'
      attempts: number
      errorSubtype?: string | null
    }
  | { kind: 'harness.retry'; phase: 'unknown' }
  | {
      kind: 'harness.compaction'
      trigger: string | null
      preTokens: number | null
      postTokens: number | null
      durationMs: number | null
    }
  | {
      kind: 'harness.denial'
      toolUseId?: string | null
      toolName: string | null
      reasonType: string | null
      reason: string | null
    }
  | {
      kind: 'harness.rateLimit'
      status: string | null
      type: string | null
      utilization: number | null
      resetsAt: number | null
      overageStatus: string | null
      overageResetsAt: number | null
      overageDisabledReason: string | null
      isUsingOverage: boolean | null
      overageInUse: boolean | null
      surpassedThreshold: number | null
    }
  | {
      kind: 'harness.init'
      claudeCodeVersion: string | null
      model: string | null
      permissionMode: string | null
      mcpServers: {
        total: number
        connected: number
        /** The connected servers by name (MAR-3213); absent on facts written before it. */
        connectedNames?: string[]
        /** Connected servers beyond the 16 named above. */
        connectedOmitted?: number
        others: { name: string; status: string | null }[]
        omitted: number
        omittedAlerts: number
      } | null
      plugins: { count: number; names: string[]; omitted: number } | null
      capabilities: { values: string[]; omitted: number } | null
      tools: { count: number } | null
      skills: { count: number } | null
      slashCommands: { count: number } | null
    }
  | {
      /**
       * The running process's own MCP status, read from the resident query
       * after its start record and on demand (MAR-3206 R1). Unlike the start
       * record it names each server's scope and address; an address is its
       * origin only -- never a path, a query or credentials.
       */
      kind: 'harness.mcpStatus'
      servers: McpServerFact[]
      /** Servers beyond the ones listed above. */
      omitted: number
      /** Of those, the ones that failed or need sign-in (listed first, so rarely any). */
      omittedAlerts: number
      /**
       * The servers the loaded plugins declare, read from their manifests:
       * a plugin server the harness drops for a duplicate address is absent
       * from `servers`, and only this says where it would have pointed.
       */
      pluginServers: PluginMcpServerFact[]
    }
)

export interface McpServerFact {
  name: string
  status: string | null
  /** e.g. `claudeai`, `user`, `project`, `local`, `dynamic`; null when not reported. */
  scope: string | null
  /** `https://mcp.figma.com`; null for a server with no URL (stdio, sdk). */
  origin: string | null
}

export interface PluginMcpServerFact {
  plugin: string
  server: string
  origin: string
}

export interface HarnessEvent {
  sequence: number
  turnId: string | null
  fact: HarnessFact | { kind: 'process.ended'; at: string; reason?: string }
}
export interface HarnessTurn {
  id: string
  status: string
  startedAt: string
  endedAt: string | null
  permissionDenials: unknown
}
export interface HarnessHook {
  fieldBounds?: HarnessFact['fieldBounds']
  truncated?: true
  id: string
  name: string | null
  event: string | null
  status: 'running' | 'ok' | 'failed' | 'blocked' | 'cancelled' | 'unknown'
  startedAt: string | null
  durationMs: number | null
  output: HarnessOutput | null
}
export interface HarnessRetry {
  attempts: number
  state: 'in-flight' | 'succeeded' | 'failed' | 'unknown'
  last: Extract<HarnessFact, { kind: 'harness.retry' }>
}
export interface HarnessTurnFacts {
  turnId: string
  hooks: HarnessHook[]
  retries: HarnessRetry | null
  denials:
    | {
        fieldBounds?: HarnessFact['fieldBounds']
        truncated?: true
        toolUseId?: string | null
        toolName: string | null
        reasonType: string | null
        reason: string | null
        at: string | null
      }[]
    | null
}
export interface SessionHarnessFacts {
  turns: HarnessTurnFacts[]
  currentTurn: HarnessTurnFacts | null
  compactions: (Extract<HarnessFact, { kind: 'harness.compaction' }> & {
    sequence: number
  })[]
  rateLimit: Extract<HarnessFact, { kind: 'harness.rateLimit' }> | null
  init: Extract<HarnessFact, { kind: 'harness.init' }> | null
  /**
   * The latest MCP status read since the latest start record (MAR-3206);
   * absent when none was read.
   */
  mcpStatus?: Extract<HarnessFact, { kind: 'harness.mcpStatus' }>
}
