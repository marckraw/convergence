import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EXECUTION_PROTOCOL_VERSION,
  type ExecutionHostEventEnvelope,
} from '@mrck-labs/execution-host-protocol'
import { JsonFileConversationStore } from './conversation-store'
import type {
  ConversationLogEntry,
  ConversationRecord,
} from './conversation-store.types'

/**
 * The real `node:fs/promises`, with `rename` watched.
 *
 * `create` claims to write through a temporary file and rename it, and the only
 * observable trace of a rename that DID happen is the call itself: the finished
 * state on disk is byte for byte what writing straight to the target would
 * leave. The previous canary asserted the absence of a `.tmp` file and admitted
 * in its own docblock that its mutation kept it green — a claim, not a test.
 */
const renames = vi.fn()
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...real,
    rename: (from: string, to: string) => {
      renames(from, to)
      return real.rename(from, to)
    },
  }
})

const record = (
  over: Partial<ConversationRecord> = {},
): ConversationRecord => ({
  id: 'c-1',
  title: 'make me a landing page',
  createdAt: '2026-09-02T09:00:00.000Z',
  providerId: 'claude',
  ...over,
})

const wire = (
  envelope: ExecutionHostEventEnvelope,
  at = '2026-09-02T09:00:02.000Z',
): ConversationLogEntry => ({ kind: 'wire', at, envelope })

/**
 * One entry as the store's own bytes.
 *
 * Written by hand rather than by `JSON.stringify(wire(…))`, because the entry
 * OBJECT carries a `kind` discriminator that the LINE does not: a fixture that
 * stringified the object would plant bytes this store never writes, and every
 * assertion about the file's size or shape would then be about the fixture.
 */
const line = (entry: ConversationLogEntry): string =>
  entry.kind === 'local'
    ? JSON.stringify({ at: entry.at, fact: entry.fact })
    : JSON.stringify({ at: entry.at, envelope: entry.envelope })

const envelope = (seq: number, text: string): ExecutionHostEventEnvelope => ({
  protocolVersion: EXECUTION_PROTOCOL_VERSION,
  sessionId: 'c-1',
  seq,
  event: {
    kind: 'delta',
    delta: {
      kind: 'conversation.item.add',
      item: {
        id: `i-${seq}`,
        kind: 'message',
        actor: 'assistant',
        text,
        state: 'complete',
        createdAt: '2026-09-02T09:00:01.000Z',
        updatedAt: '2026-09-02T09:00:01.000Z',
        providerMeta: {
          providerId: 'claude',
          providerItemId: null,
          providerEventType: null,
        },
      },
    },
  },
})

let root: string
let store: JsonFileConversationStore

beforeEach(async () => {
  renames.mockClear()
  root = await mkdtemp(join(tmpdir(), 'studio-store-'))
  store = new JsonFileConversationStore(root)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('JsonFileConversationStore', () => {
  it('stores and reads back a conversation', async () => {
    await store.create(record())
    expect(await store.read('c-1')).toEqual(record())
    expect(await store.list()).toEqual([record()])
  })

  it('answers nothing for a conversation it does not have', async () => {
    expect(await store.read('missing')).toBeNull()
    expect(await store.list()).toEqual([])
    expect(await store.readLog('missing')).toEqual({
      entries: [],
      unreadableTailLines: 0,
    })
  })

  it('lists conversations oldest first', async () => {
    await store.create(
      record({ id: 'b', createdAt: '2026-09-02T10:00:00.000Z' }),
    )
    await store.create(
      record({ id: 'a', createdAt: '2026-09-02T09:00:00.000Z' }),
    )
    expect((await store.list()).map((row) => row.id)).toEqual(['a', 'b'])
  })

  /**
   * The record file holds the immutable facts and nothing a person watches
   * change: a stored status or `updatedAt` would be a second encoding of what
   * the event log already says, free to drift out of step with it.
   *
   * Mutation: add `status` to what `create` writes and this goes red.
   */
  it('stores only the facts that never change', async () => {
    await store.create(record())
    const written = JSON.parse(
      await readFile(join(root, 'c-1', 'conversation.json'), 'utf-8'),
    ) as Record<string, unknown>
    expect(Object.keys(written).sort()).toEqual([
      'createdAt',
      'id',
      'providerId',
      'title',
    ])
  })

  it('appends entries and reads them back in order', async () => {
    await store.create(record())
    await store.appendEntry('c-1', {
      kind: 'local',
      at: '2026-09-02T09:00:01.000Z',
      fact: 'sent',
    })
    await store.appendEntry('c-1', wire(envelope(1, 'one')))
    await store.appendEntry('c-1', wire(envelope(2, 'two')))
    const reading = await store.readLog('c-1')
    expect(reading.entries).toEqual([
      { kind: 'local', at: '2026-09-02T09:00:01.000Z', fact: 'sent' },
      wire(envelope(1, 'one')),
      wire(envelope(2, 'two')),
    ])
    expect(reading.unreadableTailLines).toBe(0)
  })

  /**
   * A log written by the first Studio build holds bare envelopes with no
   * recorded time. Those conversations are on a real machine right now.
   *
   * Mutation: drop the bare-envelope arm from `readEntryLine` and every
   * conversation a person already has comes back empty -> red.
   */
  it('reads a log written before entries carried a time', async () => {
    await store.create(record())
    await writeFile(
      join(root, 'c-1', 'events.jsonl'),
      `${JSON.stringify(envelope(1, 'one'))}\n`,
      'utf-8',
    )
    const reading = await store.readLog('c-1')
    expect(reading.entries).toEqual([
      { kind: 'wire', at: null, envelope: envelope(1, 'one') },
    ])
    expect(reading.unreadableTailLines).toBe(0)
  })

  /**
   * A local fact and a wire envelope must never be read as one another: a fact
   * folded as an envelope would take the high-water mark to `undefined`, and an
   * envelope folded as a fact would set a status nothing on the daemon said.
   *
   * Mutation: accept any `fact` string (drop the `LOCAL_FACTS` membership
   * check) and the invented fact is read back as a fact -> red.
   */
  it.each([
    [
      'a fact this build does not know',
      '{"at":"2026-09-02T09:00:01.000Z","fact":"teleported"}',
    ],
    ['a fact with no time', '{"fact":"sent"}'],
    [
      'a wrapped entry with no time',
      '{"envelope":{"protocolVersion":1,"sessionId":"c-1","seq":1,"event":{"kind":"heartbeat"}}}',
    ],
  ])('refuses %s', async (_label, line) => {
    await store.create(record())
    await writeFile(join(root, 'c-1', 'events.jsonl'), `${line}\n`, 'utf-8')
    const reading = await store.readLog('c-1')
    expect(reading.entries).toEqual([])
    expect(reading.unreadableTailLines).toBe(1)
  })

  /**
   * An envelope carrying a newline must still be exactly one line, or the
   * reader's line split would tear a healthy log in half.
   *
   * Mutation: write the envelope with `JSON.stringify(envelope, null, 2)` and
   * this goes red — the pretty-printed form spans many lines.
   */
  it('keeps one envelope on one line however its text is shaped', async () => {
    await store.create(record())
    await store.appendEntry('c-1', wire(envelope(1, 'line one\nline two\n\n')))
    const raw = await readFile(join(root, 'c-1', 'events.jsonl'), 'utf-8')
    expect(raw.trimEnd().split('\n')).toHaveLength(1)
    const reading = await store.readLog('c-1')
    expect(reading.entries).toHaveLength(1)
  })

  /**
   * The failure an append-only file actually has: a crash mid-append. The
   * reader must stop at the tear rather than skip it — skipping would splice a
   * hole into the middle of a transcript and present it as whole.
   *
   * Mutation: `continue` instead of returning at the unreadable line and this
   * goes red on both halves — the later envelope reappears and the count is
   * zero.
   */
  it('stops at a torn line and counts what it refused to guess at', async () => {
    await store.create(record())
    await writeFile(
      join(root, 'c-1', 'events.jsonl'),
      `${line(wire(envelope(1, 'one')))}\n{"at":"2026-09-02T09\n${line(wire(envelope(3, 'three')))}\n`,
      'utf-8',
    )
    const reading = await store.readLog('c-1')
    expect(reading.entries).toEqual([wire(envelope(1, 'one'))])
    expect(reading.unreadableTailLines).toBe(2)
  })

  /**
   * A truncation can land on a boundary that still parses as JSON. An object
   * with no `seq` would take the fold's high-water mark to `undefined` and stop
   * every later envelope from applying, silently.
   *
   * Mutation: drop the `typeof candidate.seq !== 'number'` arm -> red.
   */
  it.each([
    [
      'no seq',
      '{"protocolVersion":1,"sessionId":"c-1","event":{"kind":"heartbeat"}}',
    ],
    [
      'a seq that is not a number',
      '{"protocolVersion":1,"sessionId":"c-1","seq":"1","event":{"kind":"heartbeat"}}',
    ],
    [
      'no sessionId',
      '{"protocolVersion":1,"seq":1,"event":{"kind":"heartbeat"}}',
    ],
    ['no event', '{"protocolVersion":1,"sessionId":"c-1","seq":1}'],
    [
      'a null event',
      '{"protocolVersion":1,"sessionId":"c-1","seq":1,"event":null}',
    ],
  ])('refuses a line with %s, though it parses', async (_label, line) => {
    // One case per field, because a line missing everything is caught by
    // whichever check runs first — and a mutation to any of the others then
    // stays green.
    await store.create(record())
    await writeFile(join(root, 'c-1', 'events.jsonl'), `${line}\n`, 'utf-8')
    const reading = await store.readLog('c-1')
    expect(reading.entries).toEqual([])
    expect(reading.unreadableTailLines).toBe(1)
  })

  /**
   * A directory whose record file is missing or unreadable is not a
   * conversation, and inventing one would put a row in the list that nothing on
   * the daemon answers to.
   *
   * Mutation: return a defaulted record from `read` instead of null -> red.
   */
  it.each(['id', 'title', 'createdAt', 'providerId'])(
    'skips a record missing only its %s',
    async (field) => {
      // One case per field for the same reason as the log lines above: a
      // record missing everything proves only that the first check works.
      const incomplete: Record<string, unknown> = { ...record({ id: 'junk' }) }
      delete incomplete[field]
      await mkdir(join(root, 'junk'), { recursive: true })
      await writeFile(
        join(root, 'junk', 'conversation.json'),
        JSON.stringify(incomplete),
        'utf-8',
      )
      await store.create(record())
      expect((await store.list()).map((row) => row.id)).toEqual(['c-1'])
    },
  )

  it('skips a directory whose record is not readable at all', async () => {
    await mkdir(join(root, 'junk'), { recursive: true })
    await writeFile(
      join(root, 'junk', 'conversation.json'),
      'not json',
      'utf-8',
    )
    await store.create(record())
    expect((await store.list()).map((row) => row.id)).toEqual(['c-1'])
  })

  /**
   * The record is written through a rename, so a reader never sees half of it.
   *
   * Mutation: write straight to the target path — `writeFile(target, …)` with
   * no temporary and no rename — and this goes red on the rename that never
   * happened. The old form of this test asserted only that no `.tmp` was left
   * behind, which that same mutation satisfies perfectly.
   */
  it('writes the record through a temporary file and renames it', async () => {
    await store.create(record())
    expect(renames).toHaveBeenCalledWith(
      join(root, 'c-1', 'conversation.json.tmp'),
      join(root, 'c-1', 'conversation.json'),
    )
    await expect(
      readFile(join(root, 'c-1', 'conversation.json.tmp'), 'utf-8'),
    ).rejects.toThrow()
  })
})

/**
 * The one failure an append-only file has: a crash mid-append.
 *
 * These are the H1 canaries. Appending onto un-terminated bytes fuses the tear
 * with the next entry into a single line that parses as neither — and because
 * the reader stops at the first line it cannot read, that one line truncates
 * the conversation for every launch that follows.
 */
describe('a torn log tail', () => {
  const tear = async (bytes: string): Promise<void> => {
    await store.create(record())
    await writeFile(join(root, 'c-1', 'events.jsonl'), bytes, 'utf-8')
  }

  /**
   * Mutation: delete the `healLogTail` call from `appendEntry` and the two
   * lines fuse — the reading holds one entry and one unreadable line, and the
   * appended envelope is gone for good -> red.
   */
  it('never fuses a partial tail with the entry appended after it', async () => {
    await tear(`${line(wire(envelope(1, 'one')))}\n{"at":"2026-09-02T09`)
    await store.appendEntry('c-1', wire(envelope(2, 'two')))

    const reading = await store.readLog('c-1')
    expect(reading.entries).toEqual([
      wire(envelope(1, 'one')),
      wire(envelope(2, 'two')),
    ])
    expect(reading.unreadableTailLines).toBe(0)
  })

  /**
   * The partial bytes are dropped rather than kept as an unreadable line.
   *
   * Mutation: heal by appending a newline in every case (never truncating) and
   * the partial line survives — the reader stops at it and everything written
   * afterwards is unreadable -> red on both halves.
   */
  it('drops bytes that say nothing complete', async () => {
    await tear(`{"at":"2026-09-02T09`)
    await store.appendEntry('c-1', wire(envelope(1, 'one')))

    const raw = await readFile(join(root, 'c-1', 'events.jsonl'), 'utf-8')
    expect(raw).not.toContain('2026-09-02T09"')
    expect((await store.readLog('c-1')).entries).toEqual([
      wire(envelope(1, 'one')),
    ])
  })

  /**
   * The other half, and the reason the repair is not simply "truncate": a
   * whole entry whose newline never landed still says everything it says.
   *
   * Mutation: truncate in every case (never completing a whole entry) and the
   * first envelope is lost -> red.
   */
  it('keeps a whole entry whose newline never landed', async () => {
    await tear(line(wire(envelope(1, 'one'))))
    await store.appendEntry('c-1', wire(envelope(2, 'two')))

    expect((await store.readLog('c-1')).entries).toEqual([
      wire(envelope(1, 'one')),
      wire(envelope(2, 'two')),
    ])
  })

  /**
   * Healing reads the log once per conversation per process, not once per
   * append: only a crash can tear a tail and a crash ends a process, so the
   * alternative is the quadratic cost the append-only log exists to avoid.
   *
   * Mutation: heal on every append and the second append re-reads a file it
   * just wrote — this stays green, so the claim is pinned the other way: the
   * healed file is not re-read into a second repair, and the log grows by
   * exactly one line per append.
   */
  it('heals once and then appends plainly', async () => {
    await tear(`${line(wire(envelope(1, 'one')))}\n{"at":"partial`)
    await store.appendEntry('c-1', wire(envelope(2, 'two')))
    const afterFirst = (await stat(join(root, 'c-1', 'events.jsonl'))).size
    await store.appendEntry('c-1', wire(envelope(3, 'three')))
    const afterSecond = (await stat(join(root, 'c-1', 'events.jsonl'))).size

    expect(afterSecond - afterFirst).toBe(
      Buffer.byteLength(`${line(wire(envelope(3, 'three')))}\n`),
    )
    expect((await store.readLog('c-1')).entries).toHaveLength(3)
  })
})
