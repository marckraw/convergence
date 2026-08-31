import { randomUUID } from 'crypto'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import type {
  SessionTurnFileChangeRow,
  SessionTurnRow,
} from '../../database/database.types'
import type { GitService } from '../../git/git.service'
import {
  countAdditionsAndDeletions,
  deriveFileChangeStatus,
  deriveTurnSummary,
  isBinaryDiff,
  looksBinary,
  truncateDiffIfTooLarge,
  turnFileChangeFromRow,
  turnFileChangeToInsertRow,
  turnFromRow,
} from './turn.pure'
import {
  TURN_BINARY_DIFF_MARKER,
  type Turn,
  type TurnFileChange,
} from './turn.types'

interface BaselineFile {
  existed: boolean
  content: string
  isBinary: boolean
}

interface TurnBaseline {
  turnId: string
  sessionId: string
  workingDirectory: string
  files: Map<string, BaselineFile>
  isGitRepo: boolean
}

export type TurnDelta =
  | { kind: 'turn.add'; turn: Turn }
  | {
      kind: 'turn.fileChanges.add'
      turnId: string
      fileChanges: TurnFileChange[]
    }

export type TurnDeltaEmitter = (sessionId: string, delta: TurnDelta) => void

export interface StartTurnInput {
  sessionId: string
  turnId: string
  workingDirectory: string
  /**
   * The account serving this turn (ADR 0007, PA4). Null means the ambient
   * default account, which is what every turn taken before accounts existed
   * ran on. Claude's own transcript records no account attribution, so if this
   * row does not hold it, the information does not exist.
   */
  providerAccountId?: string | null
  /**
   * The model and effort this turn runs on (MAR-2551). Read from the session
   * row at the moment the turn opens rather than carried in a pending slot:
   * the row cannot move while a handle is attached, because
   * `describeModelSelectionRefusal` refuses every write in that window, and the
   * handle is registered in the same synchronous block that dispatches. So
   * unlike the account — which is a per-send choice and rides the one-deep slot
   * MAR-2539 describes — this fact needs no keying at all.
   */
  model?: string | null
  effort?: string | null
}

export interface EndTurnInput {
  sessionId: string
  turnId: string
  status: 'completed' | 'errored'
  summarySource: string | null
}

function readWorkingTreeFile(
  workingDirectory: string,
  relativePath: string,
): { existed: boolean; content: string; isBinary: boolean } {
  const absolute = join(workingDirectory, relativePath)
  if (!existsSync(absolute)) {
    return { existed: false, content: '', isBinary: false }
  }
  try {
    const raw = readFileSync(absolute)
    const isBinary = raw.includes(0)
    const content = isBinary ? '' : raw.toString('utf8')
    return { existed: true, content, isBinary }
  } catch {
    return { existed: false, content: '', isBinary: false }
  }
}

export class TurnCaptureService {
  private baselines = new Map<string, TurnBaseline>()
  private inFlightStarts = new Map<string, Promise<void>>()
  private pendingEnds = new Map<
    string,
    { input: EndTurnInput; timer: NodeJS.Timeout }
  >()
  private inFlightFinalizes = new Map<string, Promise<void>>()
  private emitDelta: TurnDeltaEmitter = () => {}
  private readonly debounceMs: number

  constructor(
    private readonly gitService: GitService,
    private readonly db: Database.Database,
    options?: { debounceMs?: number },
  ) {
    this.debounceMs = options?.debounceMs ?? 150
  }

  setDeltaEmitter(fn: TurnDeltaEmitter): void {
    this.emitDelta = fn
  }

  startTurn(input: StartTurnInput): Promise<void> {
    const operation = this.captureTurnStart(input)
    const tracked = operation.finally(() => {
      if (this.inFlightStarts.get(input.turnId) === tracked) {
        this.inFlightStarts.delete(input.turnId)
      }
    })
    this.inFlightStarts.set(input.turnId, tracked)
    return tracked
  }

  private async captureTurnStart(input: StartTurnInput): Promise<void> {
    const nextSequence = this.getNextSequence(input.sessionId)
    const startedAt = new Date().toISOString()

    const insertRow = {
      id: input.turnId,
      sessionId: input.sessionId,
      sequence: nextSequence,
      startedAt,
      endedAt: null,
      status: 'running' as const,
      summary: null,
      providerAccountId: input.providerAccountId ?? null,
      model: input.model ?? null,
      effort: input.effort ?? null,
    }

    this.db
      .prepare(
        `INSERT INTO session_turns (
           id, session_id, sequence, started_at, ended_at, status, summary,
           provider_account_id, model, effort
         )
         VALUES (
           @id, @sessionId, @sequence, @startedAt, @endedAt, @status, @summary,
           @providerAccountId, @model, @effort
         )`,
      )
      .run(insertRow)

    const isGitRepo = await this.gitService.isGitRepository(
      input.workingDirectory,
    )

    const files = isGitRepo
      ? await this.captureBaselineFiles(input.workingDirectory)
      : new Map<string, BaselineFile>()

    this.baselines.set(input.turnId, {
      turnId: input.turnId,
      sessionId: input.sessionId,
      workingDirectory: input.workingDirectory,
      files,
      isGitRepo,
    })

    this.emitDelta(input.sessionId, {
      kind: 'turn.add',
      turn: {
        id: input.turnId,
        sessionId: input.sessionId,
        sequence: nextSequence,
        providerAccountId: input.providerAccountId ?? null,
        model: input.model ?? null,
        effort: input.effort ?? null,
        startedAt,
        endedAt: null,
        status: 'running',
        summary: null,
      },
    })
  }

  endTurn(input: EndTurnInput): void {
    const existing = this.pendingEnds.get(input.sessionId)
    if (existing) clearTimeout(existing.timer)

    const timer = setTimeout(() => {
      this.pendingEnds.delete(input.sessionId)
      this.runFinalize(input)
    }, this.debounceMs)
    this.pendingEnds.set(input.sessionId, { input, timer })
  }

  async flushPendingEnd(sessionId: string): Promise<void> {
    const pending = this.pendingEnds.get(sessionId)
    if (pending) {
      clearTimeout(pending.timer)
      this.pendingEnds.delete(sessionId)
      this.runFinalize(pending.input)
    }
    const inFlight = this.inFlightFinalizes.get(sessionId)
    if (inFlight) await inFlight
  }

  private runFinalize(input: EndTurnInput): void {
    const promise = this.finalizeEnd(input).finally(() => {
      if (this.inFlightFinalizes.get(input.sessionId) === promise) {
        this.inFlightFinalizes.delete(input.sessionId)
      }
    })
    this.inFlightFinalizes.set(input.sessionId, promise)
  }

  recoverRunningTurns(): void {
    this.db
      .prepare(
        `UPDATE session_turns
         SET status = 'errored', ended_at = COALESCE(ended_at, datetime('now'))
         WHERE status = 'running'`,
      )
      .run()
  }

  listTurns(sessionId: string): Turn[] {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, sequence, started_at, ended_at, status, summary,
                provider_account_id, model, effort
         FROM session_turns
         WHERE session_id = ?
         ORDER BY sequence ASC`,
      )
      .all(sessionId) as SessionTurnRow[]
    return rows.map(turnFromRow)
  }

  listFileChanges(turnId: string): TurnFileChange[] {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, turn_id, repo_root, file_path, old_path, status,
                additions, deletions, diff, truncated, binary, created_at
         FROM session_turn_file_changes
         WHERE turn_id = ?
         ORDER BY file_path ASC`,
      )
      .all(turnId) as SessionTurnFileChangeRow[]
    return rows.map(turnFileChangeFromRow)
  }

  /**
   * The diff of one file change, identified the way the row is keyed since
   * MAR-2589: turn, repository, path.
   *
   * `repoRoot` is optional and the two absences mean different things.
   * `undefined` is "by turn and path alone" — what every caller meant before a
   * change could belong to a repository, and still the whole answer for a turn
   * that touched one. A `string | null` names the repository, `null` being the
   * working-directory root; it is folded to `''` exactly as the identity index
   * folds it, so a local row (whose `repo_root` is null) resolves through the
   * repo-aware path to the same row the old lookup returned.
   */
  getFileDiff(
    turnId: string,
    filePath: string,
    repoRoot?: string | null,
  ): string {
    const row =
      repoRoot === undefined
        ? (this.db
            .prepare(
              `SELECT diff FROM session_turn_file_changes
               WHERE turn_id = ? AND file_path = ?`,
            )
            .get(turnId, filePath) as { diff: string } | undefined)
        : (this.db
            .prepare(
              `SELECT diff FROM session_turn_file_changes
               WHERE turn_id = ?
                 AND COALESCE(repo_root, '') = ?
                 AND file_path = ?`,
            )
            .get(turnId, repoRoot ?? '', filePath) as
            | { diff: string }
            | undefined)
    return row?.diff ?? ''
  }

  private getNextSequence(sessionId: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(MAX(sequence), 0) AS max_sequence
         FROM session_turns
         WHERE session_id = ?`,
      )
      .get(sessionId) as { max_sequence: number }
    return row.max_sequence + 1
  }

  private async captureBaselineFiles(
    workingDirectory: string,
  ): Promise<Map<string, BaselineFile>> {
    const files = new Map<string, BaselineFile>()
    const status = await this.gitService.getStatus(workingDirectory)
    for (const entry of status) {
      if (entry.status.includes('D')) {
        files.set(entry.file, { existed: false, content: '', isBinary: false })
        continue
      }
      const { existed, content, isBinary } = readWorkingTreeFile(
        workingDirectory,
        entry.file,
      )
      files.set(entry.file, { existed, content, isBinary })
    }
    return files
  }

  private async finalizeEnd(input: EndTurnInput): Promise<void> {
    const start = this.inFlightStarts.get(input.turnId)
    if (start) {
      try {
        await start
      } catch {
        // The turn row can still be finalized when baseline capture failed.
      }
    }

    const baseline = this.baselines.get(input.turnId)
    const endedAt = new Date().toISOString()
    const summary = deriveTurnSummary(input.summarySource)

    if (!baseline || baseline.turnId !== input.turnId) {
      this.db
        .prepare(
          `UPDATE session_turns
           SET ended_at = ?, status = ?, summary = ?
           WHERE id = ?`,
        )
        .run(endedAt, input.status, summary, input.turnId)
      return
    }

    const changes = baseline.isGitRepo
      ? await this.computeFileChanges(baseline)
      : []

    const insertChange = this.db.prepare(
      `INSERT INTO session_turn_file_changes (
         id, session_id, turn_id, repo_root, file_path, old_path, status,
         additions, deletions, diff, truncated, binary, created_at
       ) VALUES (@id, @sessionId, @turnId, @repoRoot, @filePath, @oldPath,
                 @status, @additions, @deletions, @diff, @truncated, @binary,
                 @createdAt)`,
    )
    const updateTurn = this.db.prepare(
      `UPDATE session_turns
       SET ended_at = ?, status = ?, summary = ?
       WHERE id = ?`,
    )

    const tx = this.db.transaction((fileChanges: TurnFileChange[]) => {
      for (const change of fileChanges) {
        insertChange.run(turnFileChangeToInsertRow(change))
      }
      updateTurn.run(endedAt, input.status, summary, input.turnId)
    })
    tx(changes)

    this.baselines.delete(input.turnId)

    if (changes.length > 0) {
      this.emitDelta(input.sessionId, {
        kind: 'turn.fileChanges.add',
        turnId: input.turnId,
        fileChanges: changes,
      })
    }
  }

  private async computeFileChanges(
    baseline: TurnBaseline,
  ): Promise<TurnFileChange[]> {
    const endStatus = await this.gitService.getStatus(baseline.workingDirectory)
    const candidates = new Set<string>()
    for (const path of baseline.files.keys()) candidates.add(path)
    for (const entry of endStatus) {
      if (!entry.status.includes('D')) {
        candidates.add(entry.file)
      } else {
        candidates.add(entry.file)
      }
    }

    const changes: TurnFileChange[] = []
    for (const filePath of candidates) {
      const startEntry = baseline.files.get(filePath)
      let startExisted: boolean
      let startContent: string
      let startBinary: boolean
      if (startEntry) {
        startExisted = startEntry.existed
        startContent = startEntry.content
        startBinary = startEntry.isBinary
      } else {
        const headContent = await this.gitService.getFileAtHead(
          baseline.workingDirectory,
          filePath,
        )
        startExisted = headContent !== null
        startContent = headContent ?? ''
        startBinary = headContent !== null && looksBinary(headContent)
      }

      const current = readWorkingTreeFile(baseline.workingDirectory, filePath)
      const endExisted = current.existed
      const endContent = current.content
      const endBinary = current.isBinary

      const isBinary = startBinary || endBinary
      const status = deriveFileChangeStatus(
        startExisted,
        endExisted,
        startContent,
        endContent,
        isBinary,
      )
      if (status === null) continue

      let diffBody: string
      if (isBinary) {
        diffBody = TURN_BINARY_DIFF_MARKER
      } else {
        diffBody = await this.produceDiff(
          baseline.workingDirectory,
          filePath,
          startExisted ? startContent : null,
          endExisted ? endContent : null,
        )
      }

      const { diff: finalDiff, truncated } = truncateDiffIfTooLarge(diffBody)
      const counts =
        isBinary || truncated || isBinaryDiff(finalDiff)
          ? { additions: 0, deletions: 0 }
          : countAdditionsAndDeletions(finalDiff)

      changes.push({
        id: randomUUID(),
        sessionId: baseline.sessionId,
        turnId: baseline.turnId,
        // Local capture reads one working tree, so every change belongs to its
        // root repository; multi-repo roots only arrive from a host.
        repoRoot: null,
        filePath,
        oldPath: null,
        status,
        additions: counts.additions,
        deletions: counts.deletions,
        diff: finalDiff,
        // Both were already computed here and spent only on a marker string in
        // the diff body. Recording them as fields is what lets a reader tell a
        // fragment from a whole change without parsing the diff (MAR-2577);
        // the diff text itself is unchanged.
        truncated,
        binary: isBinary || isBinaryDiff(finalDiff),
        createdAt: new Date().toISOString(),
      })
    }
    return changes
  }

  private async produceDiff(
    workingDirectory: string,
    filePath: string,
    startContent: string | null,
    endContent: string | null,
  ): Promise<string> {
    const sandbox = mkdtempSync(join(tmpdir(), 'convergence-turn-diff-'))
    try {
      const leftPath =
        startContent === null
          ? '/dev/null'
          : this.writeSandboxFile(sandbox, 'before', filePath, startContent)
      const rightPath =
        endContent === null
          ? '/dev/null'
          : this.writeSandboxFile(sandbox, 'after', filePath, endContent)

      return await this.gitService.diffTwoPaths(
        workingDirectory,
        leftPath,
        rightPath,
      )
    } finally {
      rmSync(sandbox, { recursive: true, force: true })
    }
  }

  private writeSandboxFile(
    sandbox: string,
    side: 'before' | 'after',
    filePath: string,
    content: string,
  ): string {
    const safeName = filePath.replace(/[^a-zA-Z0-9._-]+/g, '_')
    const path = join(sandbox, `${side}-${safeName}`)
    writeFileSync(path, content)
    return path
  }
}
