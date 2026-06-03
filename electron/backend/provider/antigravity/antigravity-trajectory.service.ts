import Database from 'better-sqlite3'
import { access } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import {
  extractAntigravityTrajectoryToolEvents,
  type AntigravityTrajectoryStepRow,
  type AntigravityTrajectoryToolEvent,
} from './antigravity-trajectory.pure'

export interface AntigravityTrajectoryTelemetry {
  getMaxStepIndex(conversationId: string): Promise<number | null>
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
