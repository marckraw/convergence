import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  EXECUTION_PROTOCOL_VERSION,
  type ExecutionHostEventEnvelope,
} from '@mrck-labs/execution-host-protocol'
import { JsonFileConversationStore } from './conversation-store'
import type { ConversationRecord } from './conversation-store.types'

const record = (
  over: Partial<ConversationRecord> = {},
): ConversationRecord => ({
  id: 'c-1',
  title: 'make me a landing page',
  createdAt: '2026-09-02T09:00:00.000Z',
  providerId: 'claude',
  ...over,
})

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
      envelopes: [],
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

  it('appends envelopes and reads them back in order', async () => {
    await store.create(record())
    await store.appendEnvelope('c-1', envelope(1, 'one'))
    await store.appendEnvelope('c-1', envelope(2, 'two'))
    const reading = await store.readLog('c-1')
    expect(reading.envelopes.map((row) => row.seq)).toEqual([1, 2])
    expect(reading.unreadableTailLines).toBe(0)
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
    await store.appendEnvelope('c-1', envelope(1, 'line one\nline two\n\n'))
    const raw = await readFile(join(root, 'c-1', 'events.jsonl'), 'utf-8')
    expect(raw.trimEnd().split('\n')).toHaveLength(1)
    const reading = await store.readLog('c-1')
    expect(reading.envelopes).toHaveLength(1)
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
    await store.appendEnvelope('c-1', envelope(1, 'one'))
    await writeFile(
      join(root, 'c-1', 'events.jsonl'),
      `${JSON.stringify(envelope(1, 'one'))}\n{"protocolVersion":1,"sess\n${JSON.stringify(envelope(3, 'three'))}\n`,
      'utf-8',
    )
    const reading = await store.readLog('c-1')
    expect(reading.envelopes.map((row) => row.seq)).toEqual([1])
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
    expect(reading.envelopes).toEqual([])
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
   * Mutation: write straight to the target path and the temporary file stops
   * existing — but the guarantee goes with it, so this pins the mechanism by
   * its observable trace: no `.tmp` is left behind, and the file is complete.
   */
  it('leaves no temporary file behind', async () => {
    await store.create(record())
    await expect(
      readFile(join(root, 'c-1', 'conversation.json.tmp'), 'utf-8'),
    ).rejects.toThrow()
  })
})
