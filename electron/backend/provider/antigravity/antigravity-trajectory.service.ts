import Database from 'better-sqlite3'
import { access, readdir, stat } from 'fs/promises'
import { homedir } from 'os'
import { basename, join } from 'path'
import {
  extractAntigravityTrajectoryToolEvents,
  type AntigravityTrajectoryStepRow,
  type AntigravityTrajectoryToolEvent,
} from './antigravity-trajectory.pure'

export interface AntigravityTrajectoryTelemetry {
  getMaxStepIndex(conversationId: string): Promise<number | null>
  findLatestConversationIdUpdatedAfter(
    updatedAfterMs: number,
  ): Promise<string | null>
  readToolEvents(
    conversationId: string,
    afterStepIndex: number | null,
  ): Promise<AntigravityTrajectoryToolEvent[]>
}

interface AntigravityTrajectoryRow {
  idx: number
  step_type: number
  status: number
  step_payload: Buffer
}

const CONVERSATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function getDefaultAntigravityConversationsDir(): string {
  return join(homedir(), '.gemini', 'antigravity-cli', 'conversations')
}

function conversationDbPath(
  conversationsDir: string,
  conversationId: string,
): string | null {
  if (!CONVERSATION_ID_PATTERN.test(conversationId)) return null
  return join(conversationsDir, `${conversationId}.db`)
}

function conversationIdFromDbFilename(path: string): string | null {
  const filename = basename(path)
  if (!filename.endsWith('.db')) return null

  const conversationId = filename.slice(0, -'.db'.length)
  return CONVERSATION_ID_PATTERN.test(conversationId) ? conversationId : null
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return false
    }
    throw error
  }
}

export class AntigravityTrajectoryTelemetryService implements AntigravityTrajectoryTelemetry {
  constructor(
    private readonly conversationsDir = getDefaultAntigravityConversationsDir(),
  ) {}

  async getMaxStepIndex(conversationId: string): Promise<number | null> {
    const dbPath = conversationDbPath(this.conversationsDir, conversationId)
    if (!dbPath || !(await pathExists(dbPath))) return null

    const db = new Database(dbPath, { readonly: true, fileMustExist: true })
    try {
      const row = db.prepare('SELECT MAX(idx) AS max_idx FROM steps').get() as
        | { max_idx: number | null }
        | undefined
      return row?.max_idx ?? null
    } finally {
      db.close()
    }
  }

  async findLatestConversationIdUpdatedAfter(
    updatedAfterMs: number,
  ): Promise<string | null> {
    let entries: string[]
    try {
      entries = await readdir(this.conversationsDir)
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        (error as { code?: unknown }).code === 'ENOENT'
      ) {
        return null
      }
      throw error
    }

    const candidates: Array<{ conversationId: string; mtimeMs: number }> = []
    for (const entry of entries) {
      const conversationId = conversationIdFromDbFilename(entry)
      if (!conversationId) continue

      const dbPath = join(this.conversationsDir, entry)
      const stats = await stat(dbPath)
      if (!stats.isFile()) continue
      if (stats.mtimeMs < updatedAfterMs) continue
      candidates.push({ conversationId, mtimeMs: stats.mtimeMs })
    }

    candidates.sort((a, b) => {
      const byModifiedTime = b.mtimeMs - a.mtimeMs
      if (byModifiedTime !== 0) return byModifiedTime

      return b.conversationId.localeCompare(a.conversationId)
    })
    return candidates[0]?.conversationId ?? null
  }

  async readToolEvents(
    conversationId: string,
    afterStepIndex: number | null,
  ): Promise<AntigravityTrajectoryToolEvent[]> {
    const dbPath = conversationDbPath(this.conversationsDir, conversationId)
    if (!dbPath || !(await pathExists(dbPath))) return []

    const db = new Database(dbPath, { readonly: true, fileMustExist: true })
    try {
      const rows = db
        .prepare(
          `SELECT idx, step_type, status, step_payload
             FROM steps
            WHERE (? IS NULL OR idx > ?)
            ORDER BY idx`,
        )
        .all(afterStepIndex, afterStepIndex) as AntigravityTrajectoryRow[]

      const steps: AntigravityTrajectoryStepRow[] = rows.map((row) => ({
        idx: row.idx,
        stepType: row.step_type,
        status: row.status,
        stepPayload: row.step_payload,
      }))

      return extractAntigravityTrajectoryToolEvents(steps)
    } finally {
      db.close()
    }
  }
}
