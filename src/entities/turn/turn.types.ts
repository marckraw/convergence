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
