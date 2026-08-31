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
  /**
   * The model and effort this turn actually ran on (MAR-2551). The session row
   * only ever holds the *latest* selection, so once a conversation can change
   * model between turns this is the only place the mix is written down.
   */
  model: string | null
  effort: string | null
}

export interface TurnFileChange {
  id: string
  sessionId: string
  turnId: string
  /**
   * Which repository inside a multi-repo workspace this change belongs to,
   * workspace-relative; `null` is the working-directory root repository, which
   * is every locally captured change (MAR-2577).
   */
  repoRoot: string | null
  filePath: string
  oldPath: string | null
  status: TurnFileChangeStatus
  additions: number
  deletions: number
  diff: string
  /**
   * The stored diff is a fragment, not the change. Rendering it without saying
   * so is the review surface lying by omission — which is the whole reason
   * these two are fields rather than marker text inside `diff` (MAR-2577).
   */
  truncated: boolean
  /** The file is binary, so `diff` is a marker rather than content. */
  binary: boolean
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
