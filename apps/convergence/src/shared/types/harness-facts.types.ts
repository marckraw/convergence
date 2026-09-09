export type HarnessOutput =
  | string
  | { truncated: true; bytes: number; preview: string }

export type HarnessFact = { at: string } & (
  | {
      kind: 'harness.hook'
      hookId: string | null
      hookName: string | null
      hookEvent: string | null
      phase: 'started' | 'progress' | 'response'
      status: 'ok' | 'failed' | 'blocked' | null
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
      outcome: 'succeeded' | 'failed'
      attempts: number
      errorSubtype?: string | null
    }
  | {
      kind: 'harness.compaction'
      trigger: string | null
      preTokens: number | null
      postTokens: number | null
      durationMs: number | null
    }
  | {
      kind: 'harness.denial'
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
      mcpServers: { name: string; status: string | null }[] | null
      plugins:
        | { name: string; path: string | null; version: string | null }[]
        | null
      capabilities: string[] | null
      skillsCount: number | null
      slashCommandsCount: number | null
    }
)

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
  id: string
  name: string | null
  event: string | null
  status: 'running' | 'ok' | 'failed' | 'blocked' | 'unknown'
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
}
