import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  rename,
  truncate,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import type { ExecutionHostEventEnvelope } from '@mrck-labs/execution-host-protocol'
import type {
  ConversationLogEntry,
  ConversationLogReading,
  ConversationRecord,
  ConversationStore,
  LocalConversationFact,
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
 *   <root>/<id>/events.jsonl        the log, appended to, never rewritten
 *
 * The split is not cosmetic. Rewriting a whole JSON document on every envelope
 * makes a conversation cost the square of its own length, which is the exact
 * shape of the bug the protocol's append deltas exist to avoid. An append-only
 * log costs one write per event and is also the thing a restart replays.
 *
 * The record is written through a temporary file and renamed, so a crash mid
 * write leaves either the old bytes or the new ones and never half of each.
 * The log cannot be written that way — appending is the point — so the tear is
 * repaired instead, and the READER and the HEALER share one boundary: the
 * first line that cannot be parsed. The reader stops there and says how many
 * lines it refused to guess at; the first append of a process truncates the
 * file there (below). Two different boundaries — a healer that looked only at
 * the tail while the reader stopped wherever the damage was — is how a log
 * already fused by an earlier build stayed unreadable past its middle forever,
 * growing on every launch behind a line nothing would ever pass.
 */
export class JsonFileConversationStore implements ConversationStore {
  /**
   * Conversations whose log this process has already inspected.
   *
   * Only a crash can tear a tail, and a crash ends a process, so one look per
   * conversation per process is exactly enough — and the alternative, reading
   * the whole log before every append, is the quadratic cost the append-only
   * log exists to avoid.
   */
  private readonly healedLogs = new Set<string>()

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

  async appendEntry(id: string, entry: ConversationLogEntry): Promise<void> {
    await mkdir(this.conversationDir(id), { recursive: true })
    if (!this.healedLogs.has(id)) {
      await this.healLog(id)
      this.healedLogs.add(id)
    }
    // `JSON.stringify` escapes every newline it encounters, so one entry is
    // always exactly one line and the reader's line split is exact.
    await appendFile(this.logPath(id), `${serializeEntry(entry)}\n`, 'utf-8')
  }

  async readLog(id: string): Promise<ConversationLogReading> {
    let text: string
    try {
      text = await readFile(this.logPath(id), 'utf-8')
    } catch {
      return { entries: [], unreadableTailLines: 0 }
    }

    const lines = text.split('\n')
    // A trailing newline after the last complete record is not a line.
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

    const entries: ConversationLogEntry[] = []
    for (let index = 0; index < lines.length; index += 1) {
      const entry = readEntryLine(lines[index])
      if (entry === null) {
        return { entries, unreadableTailLines: lines.length - index }
      }
      entries.push(entry)
    }
    return { entries, unreadableTailLines: 0 }
  }

  /**
   * Makes the log readable end to end before anything is appended to it.
   *
   * A crash mid-append leaves bytes with no newline after them. Appending
   * straight onto those bytes FUSES the tear with the next entry, producing one
   * line that parses as neither — and because the reader stops at the first
   * line it cannot read, that single line truncates the conversation for every
   * launch that follows, forever, while the tail keeps being re-requested and
   * re-appended behind it.
   *
   * The repair is bounded by the READER'S OWN boundary, not by the file's end:
   * the log is truncated at the first line that cannot be parsed, wherever it
   * sits. Those bytes cost nothing to drop — the reader never got past them, so
   * the fold never advanced over them and the resume asks the daemon for that
   * sequence again — and the lines behind them were never reachable either. A
   * heal that only ever looked at the tail could not repair a log a previous
   * build had already fused, which is exactly the log some machines are
   * carrying.
   *
   * One case is not a truncation: a WHOLE entry whose newline never landed says
   * everything it says, so it gets its missing byte and stands. Writing a
   * newline in BOTH cases would look like healing and be the same disease — the
   * partial line would sit there unreadable, and the reader would still stop at
   * it for good.
   */
  private async healLog(id: string): Promise<void> {
    let text: string
    try {
      text = await readFile(this.logPath(id), 'utf-8')
    } catch {
      return
    }
    if (text === '') return

    const endsOnBoundary = text.endsWith('\n')
    const lines = text.split('\n')
    // A trailing newline after the last complete entry is not a line.
    if (endsOnBoundary) lines.pop()

    let offset = 0
    for (const line of lines) {
      if (readEntryLine(line) === null) {
        await truncate(this.logPath(id), offset)
        return
      }
      offset += Buffer.byteLength(line, 'utf-8') + 1
    }
    if (!endsOnBoundary) await appendFile(this.logPath(id), '\n', 'utf-8')
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
 * One entry as one line.
 *
 * A wire entry is wrapped rather than written bare so the line can carry the
 * time it was recorded: the protocol's envelope has no timestamp of its own,
 * and a bare `status` event would otherwise leave a conversation's
 * last-updated time sitting at whenever it last happened to carry one.
 */
function serializeEntry(entry: ConversationLogEntry): string {
  return entry.kind === 'local'
    ? JSON.stringify({ at: entry.at, fact: entry.fact })
    : JSON.stringify({ at: entry.at, envelope: entry.envelope })
}

const LOCAL_FACTS: readonly LocalConversationFact[] = [
  'sent',
  'refused',
  'stream-exhausted',
]

/**
 * One log line as an entry, or null when it is not one.
 *
 * Three shapes are readable, and the third is the reason the other two are
 * distinguishable at all:
 *
 *   {"at":…,"fact":…}      a fact Studio recorded
 *   {"at":…,"envelope":…}  an envelope off the wire
 *   {"protocolVersion":…}  a bare envelope, written before this shape existed
 *
 * The legacy form is read rather than refused because logs written by the
 * first Studio build are on a real machine right now, and a reader that
 * rejected them would empty every conversation a person already has.
 *
 * The shape is checked rather than trusted. A half-written line can parse as
 * valid JSON — `{"seq":1` cannot, but a truncation landing on a boundary can
 * produce something that does — and an object without a `seq` would take the
 * fold's high-water mark to `undefined` and stop every later envelope from
 * being applied.
 */
function readEntryLine(line: string): ConversationLogEntry | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const candidate = parsed as Record<string, unknown>

  if (candidate.fact !== undefined) {
    return isLocalFact(candidate.fact) && typeof candidate.at === 'string'
      ? { kind: 'local', at: candidate.at, fact: candidate.fact }
      : null
  }

  if (candidate.envelope !== undefined) {
    const envelope = readEnvelope(candidate.envelope)
    if (envelope === null || typeof candidate.at !== 'string') return null
    return { kind: 'wire', at: candidate.at, envelope }
  }

  const envelope = readEnvelope(parsed)
  return envelope === null ? null : { kind: 'wire', at: null, envelope }
}

function isLocalFact(value: unknown): value is LocalConversationFact {
  return (
    typeof value === 'string' &&
    LOCAL_FACTS.includes(value as LocalConversationFact)
  )
}

function readEnvelope(value: unknown): ExecutionHostEventEnvelope | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<ExecutionHostEventEnvelope>
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
