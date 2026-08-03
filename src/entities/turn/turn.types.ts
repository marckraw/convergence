export type TurnStatus = 'running' | 'completed' | 'errored'

export type TurnFileChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed'

export interface Turn {
  id: string
  sessionId: string
  sequence: number
  startedAt: string
  endedAt: string | null
  status: TurnStatus
  summary: string | null
  /**
   * The provider account that served this turn; `null` is the ambient default
   * (ADR 0007, PA4). This is the durable record — the composer's selection is
   * only composer state, so this is what "which account is this conversation
   * on" actually means.
   */
  providerAccountId: string | null
}

export interface TurnFileChange {
  id: string
  sessionId: string
  turnId: string
  filePath: string
  oldPath: string | null
  status: TurnFileChangeStatus
  additions: number
  deletions: number
  diff: string
  createdAt: string
}

export type TurnDelta =
  | { kind: 'turn.add'; sessionId: string; turn: Turn }
  | {
      kind: 'turn.fileChanges.add'
      sessionId: string
      turnId: string
      fileChanges: TurnFileChange[]
    }
