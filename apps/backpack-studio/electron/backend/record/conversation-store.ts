import {
  mkdir,
  readdir,
  readFile,
  rename,
  writeFile,
  appendFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import type { ExecutionHostEventEnvelope } from '@mrck-labs/execution-host-protocol'
import type {
  ConversationLogReading,
  ConversationRecord,
  ConversationStore,
} from './conversation-store.types'

/**
 * The skeleton's record: one directory per conversation under the app's own
 * data folder (MAR-2770).
 *
 * @pattern Repository. `ConversationStore` is the boundary; this is the file
 * implementation behind it, and the extraction run replaces it with SQLite
 * without a caller changing (constitution law 8).
 *
 *   <root>/<id>/conversation.json   the immutable facts, written once
 *   <root>/<id>/events.jsonl        the wire log, appended to, never rewritten
 *
 * The split is not cosmetic. Rewriting a whole JSON document on every envelope
 * makes a conversation cost the square of its own length, which is the exact
 * shape of the bug the protocol's append deltas exist to avoid. An append-only
 * log costs one write per event and is also the thing a restart replays.
 *
 * The record is written through a temporary file and renamed, so a crash mid
 * write leaves either the old bytes or the new ones and never half of each.
 * The log cannot be written that way — appending is the point — so the reader
 * carries the other half of that guarantee: it stops at the first line it
 * cannot parse and says how many it refused to guess at.
 */
export class JsonFileConversationStore implements ConversationStore {
  constructor(private readonly rootDir: string) {}

  async list(): Promise<ConversationRecord[]> {
    const entries = await this.directoryNames()
    const records = await Promise.all(entries.map((id) => this.read(id)))
    return records
      .filter((record): record is ConversationRecord => record !== null)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }

  async read(id: string): Promise<ConversationRecord | null> {
    try {
      const text = await readFile(this.recordPath(id), 'utf-8')
      const parsed = JSON.parse(text) as Partial<ConversationRecord>
      // A record whose own file cannot vouch for it is not a conversation. It
      // is skipped rather than repaired: guessing an id or a title would put a
      // conversation in the list that nothing on the daemon answers to.
      if (
        typeof parsed.id !== 'string' ||
        typeof parsed.title !== 'string' ||
        typeof parsed.createdAt !== 'string' ||
        typeof parsed.providerId !== 'string'
      ) {
        return null
      }
      return {
        id: parsed.id,
        title: parsed.title,
        createdAt: parsed.createdAt,
        providerId: parsed.providerId,
      }
    } catch {
      return null
    }
  }

  async create(record: ConversationRecord): Promise<void> {
    await mkdir(this.conversationDir(record.id), { recursive: true })
    const target = this.recordPath(record.id)
    const temporary = `${target}.tmp`
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, 'utf-8')
    await rename(temporary, target)
  }

  async appendEnvelope(
    id: string,
    envelope: ExecutionHostEventEnvelope,
  ): Promise<void> {
    await mkdir(this.conversationDir(id), { recursive: true })
    // `JSON.stringify` escapes every newline it encounters, so one envelope is
    // always exactly one line and the reader's line split is exact.
    await appendFile(this.logPath(id), `${JSON.stringify(envelope)}\n`, 'utf-8')
  }

  async readLog(id: string): Promise<ConversationLogReading> {
    let text: string
    try {
      text = await readFile(this.logPath(id), 'utf-8')
    } catch {
      return { envelopes: [], unreadableTailLines: 0 }
    }

    const lines = text.split('\n')
    // A trailing newline after the last complete record is not a line.
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

    const envelopes: ExecutionHostEventEnvelope[] = []
    for (let index = 0; index < lines.length; index += 1) {
      const envelope = readEnvelopeLine(lines[index])
      if (envelope === null) {
        return { envelopes, unreadableTailLines: lines.length - index }
      }
      envelopes.push(envelope)
    }
    return { envelopes, unreadableTailLines: 0 }
  }

  private async directoryNames(): Promise<string[]> {
    try {
      const entries = await readdir(this.rootDir, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    } catch {
      return []
    }
  }

  private conversationDir(id: string): string {
    return join(this.rootDir, id)
  }

  private recordPath(id: string): string {
    return join(this.conversationDir(id), 'conversation.json')
  }

  private logPath(id: string): string {
    return join(this.conversationDir(id), 'events.jsonl')
  }
}

/**
 * One log line as an envelope, or null when it is not one.
 *
 * The shape is checked rather than trusted. A half-written line can parse as
 * valid JSON — `{"seq":1` cannot, but a truncation landing on a boundary can
 * produce something that does — and an object without a `seq` would take the
 * fold's high-water mark to `undefined` and stop every later envelope from
 * being applied.
 */
function readEnvelopeLine(line: string): ExecutionHostEventEnvelope | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const candidate = parsed as Partial<ExecutionHostEventEnvelope>
  if (
    typeof candidate.seq !== 'number' ||
    typeof candidate.sessionId !== 'string' ||
    typeof candidate.event !== 'object' ||
    candidate.event === null
  ) {
    return null
  }
  return candidate as ExecutionHostEventEnvelope
}
