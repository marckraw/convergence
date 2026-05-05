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
  deriveTurnSummary,
  isBinaryDiff,
  truncateDiffIfTooLarge,
  turnFileChangeFromRow,
  turnFromRow,
} from './turn.pure'
import {
  TURN_BINARY_DIFF_MARKER,
  type Turn,
  type TurnFileChange,
  type TurnFileChangeStatus,
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
}

export interface EndTurnInput {
  sessionId: string
  turnId: string
  status: 'completed' | 'errored'
  summarySource: string | null
}

function looksBinary(content: string): boolean {
  const sample = content.slice(0, 8 * 1024)
  for (let i = 0; i < sample.length; i++) {
    if (sample.charCodeAt(i) === 0) return true
  }
  return false
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

function deriveStatus(
  startExisted: boolean,
  endExisted: boolean,
  startContent: string,
  endContent: string,
  isBinary: boolean,
): TurnFileChangeStatus | null {
  if (!startExisted && !endExisted) return null
  if (!startExisted) return 'added'
  if (!endExisted) return 'deleted'
  if (!isBinary && startContent === endContent) return null
  return 'modified'
}

export class TurnCaptureService {
  private baselines = new Map<string, TurnBaseline>()
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

  async startTurn(input: StartTurnInput): Promise<void> {
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
    }

    this.db
      .prepare(
        `INSERT INTO session_turns (id, session_id, sequence, started_at, ended_at, status, summary)
         VALUES (@id, @sessionId, @sequence, @startedAt, @endedAt, @status, @summary)`,
      )
      .run(insertRow)

    const isGitRepo = await this.gitService.isGitRepository(
      input.workingDirectory,
    )

    const files = isGitRepo
      ? await this.captureBaselineFiles(input.workingDirectory)
      : new Map<string, BaselineFile>()

    this.baselines.set(input.sessionId, {
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
        `SELECT id, session_id, sequence, started_at, ended_at, status, summary
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
        `SELECT id, session_id, turn_id, file_path, old_path, status,
                additions, deletions, diff, created_at
         FROM session_turn_file_changes
         WHERE turn_id = ?
         ORDER BY file_path ASC`,
      )
      .all(turnId) as SessionTurnFileChangeRow[]
    return rows.map(turnFileChangeFromRow)
  }

  getFileDiff(turnId: string, filePath: string): string {
    const row = this.db
      .prepare(
        `SELECT diff FROM session_turn_file_changes
         WHERE turn_id = ? AND file_path = ?`,
      )
      .get(turnId, filePath) as { diff: string } | undefined
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
    const baseline = this.baselines.get(input.sessionId)
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
         id, session_id, turn_id, file_path, old_path, status,
         additions, deletions, diff, created_at
       ) VALUES (@id, @sessionId, @turnId, @filePath, @oldPath, @status,
                 @additions, @deletions, @diff, @createdAt)`,
    )
    const updateTurn = this.db.prepare(
      `UPDATE session_turns
       SET ended_at = ?, status = ?, summary = ?
       WHERE id = ?`,
    )

    const tx = this.db.transaction((fileChanges: TurnFileChange[]) => {
      for (const change of fileChanges) insertChange.run(change)
      updateTurn.run(endedAt, input.status, summary, input.turnId)
    })
    tx(changes)

    this.baselines.delete(input.sessionId)

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
      const status = deriveStatus(
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
        filePath,
        oldPath: null,
        status,
        additions: counts.additions,
        deletions: counts.deletions,
        diff: finalDiff,
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
