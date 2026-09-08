import type {
  AgentRunStatus,
  SessionAgentRun,
  SessionTask,
} from '../../../src/shared/types/harness-evidence.types'
export type {
  AgentRunStatus,
  SessionAgentRun,
  SessionTask,
} from '../../../src/shared/types/harness-evidence.types'

export type AgentRunFact =
  | {
      kind: 'agent.started'
      run: Omit<
        SessionAgentRun,
        | 'sessionId'
        | 'status'
        | 'endedAt'
        | 'isBackgrounded'
        | 'lastToolName'
        | 'usageJson'
        | 'updatedAt'
      >
    }
  | {
      kind: 'agent.identified'
      spawnedByItemId: string
      id: string
      agentType: string | null
      description: string | null
      depth: number | null
      transcriptPath: string | null
    }
  | {
      kind: 'agent.changed'
      spawnedByItemId: string
      patch: Partial<
        Pick<
          SessionAgentRun,
          | 'model'
          | 'isBackgrounded'
          | 'lastToolName'
          | 'usageJson'
          | 'updatedAt'
        >
      >
    }
  | {
      kind: 'agent.ended'
      spawnedByItemId: string
      status: Exclude<AgentRunStatus, 'running' | 'unknown'>
      at: string
    }
  | {
      kind: 'process.ended'
      at: string
      reason?: 'quit' | 'idle' | 'account' | 'stop' | 'exit'
    }

export type TaskFact = {
  kind: 'task.changed'
  taskId: string
  at: string
  patch: Partial<Omit<SessionTask, 'sessionId' | 'taskId'>>
}

export type HarnessEvidence =
  | AgentRunFact
  | TaskFact
  | {
      kind: 'turn.accounting'
      resultSubtype: string | null
      usage: unknown
      costUsd: number | null
      permissionDenials: unknown
      subagentStats: unknown
    }
  | {
      kind: 'harness.unknown'
      type: string
      subtype: string | null
      payload: unknown
      at: string
    }
