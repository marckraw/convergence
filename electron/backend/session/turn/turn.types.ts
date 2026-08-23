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
  /** Account that served this turn; null is the ambient default (PA4). */
  providerAccountId: string | null
  /**
   * The model and effort this turn actually ran on (MAR-2551). Null means the
   * turn was taken before the record existed, or that the session runs on the
   * provider's own default with nothing selected.
   */
  model: string | null
  effort: string | null
}

/**
 * One file a turn changed, with the three facts that decide what its diff
 * *means* (MAR-2577).
 *
 * `truncated` and `binary` were computed by local capture and then thrown away
 * into the diff body as marker strings; a remote host reports them as fields
 * over the wire and the mapping had nowhere to put them, so a diff the daemon
 * cut short arrived indistinguishable from a whole one. They are fields here
 * because a reader has to be able to ask, without parsing prose out of a diff.
 *
 * `repoRoot` is workspace-relative and null for the working-directory root
 * repository, which is every local capture and every single-repo remote run.
 * It carries which repository a change belongs to, but it is not yet part of a
 * change's identity: storage still keys one row per `(turn_id, file_path)`, and
 * `getFileDiff` still looks a diff up by turn and path alone. Until both move,
 * the same path in two repositories of one workspace is still one change as far
 * as this app is concerned — MAR-2589, out of scope here because it needs a
 * table rebuild.
 */
export interface TurnFileChange {
  id: string
  sessionId: string
  turnId: string
  /** Workspace-relative repository root; null means the working-directory root. */
  repoRoot: string | null
  filePath: string
  oldPath: string | null
  status: TurnFileChangeStatus
  additions: number
  deletions: number
  diff: string
  /** The diff was cut short: what is stored is a fragment, not the change. */
  truncated: boolean
  /** The file is binary, so the diff text is a marker rather than content. */
  binary: boolean
  createdAt: string
}

export interface TurnInsertRow {
  id: string
  sessionId: string
  sequence: number
  startedAt: string
  endedAt: string | null
  status: TurnStatus
  summary: string | null
  providerAccountId: string | null
  model: string | null
  effort: string | null
}

export interface TurnFileChangeInsertRow {
  id: string
  sessionId: string
  turnId: string
  repoRoot: string | null
  filePath: string
  oldPath: string | null
  status: TurnFileChangeStatus
  additions: number
  deletions: number
  diff: string
  truncated: number
  binary: number
  createdAt: string
}

export const TURN_DIFF_MAX_BYTES = 200 * 1024
export const TURN_SUMMARY_MAX_CHARS = 80
export const TURN_DIFF_TRUNCATION_MARKER_PREFIX = '[diff truncated:'
export const TURN_BINARY_DIFF_MARKER = '[binary file change]'
