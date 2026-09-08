export type AgentRunStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'unknown'

export interface SessionAgentRun {
  id: string
  sessionId: string
  spawnedByItemId: string
  agentType: string | null
  description: string | null
  model: string | null
  status: AgentRunStatus
  depth: number | null
  startedAt: string
  endedAt: string | null
  transcriptPath: string | null
  isBackgrounded: boolean | null
  lastToolName: string | null
  usageJson: string | null
  updatedAt: string | null
}

export interface SessionTask {
  taskId: string
  sessionId: string
  toolUseId: string | null
  taskType: string | null
  description: string | null
  status: AgentRunStatus
  startedAt: string | null
  endedAt: string | null
  outputFile: string | null
}
