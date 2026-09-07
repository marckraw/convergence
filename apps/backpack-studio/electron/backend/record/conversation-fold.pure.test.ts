import { describe, expect, it } from 'vitest'
import {
  EXECUTION_PROTOCOL_VERSION,
  type ExecutionConversationItem,
  type ExecutionHostEventEnvelope,
  type ExecutionSessionDelta,
} from '@mrck-labs/execution-host-protocol'
import {
  applyEntry,
  applyEnvelope,
  conversationStatusFrom,
  conversationTitleFrom,
  emptyFold,
  foldEntries,
  projectItem,
  type ConversationFold,
} from './conversation-fold.pure'
import type { ConversationLogEntry } from './conversation-store.types'

const CREATED = '2026-09-02T09:00:00.000Z'

let seq = 0
const wire = (
  event: ExecutionHostEventEnvelope['event'],
): ExecutionHostEventEnvelope => ({
  protocolVersion: EXECUTION_PROTOCOL_VERSION,
  sessionId: 'c-1',
  seq: ++seq,
  event,
})
const delta = (value: ExecutionSessionDelta): ExecutionHostEventEnvelope =>
  wire({ kind: 'delta', delta: value })

const RECORDED = '2026-09-02T09:05:00.000Z'

const entry = (
  envelope: ExecutionHostEventEnvelope,
  at: string | null = RECORDED,
): ConversationLogEntry => ({ kind: 'wire', at, envelope })

const local = (
  fact: 'sent' | 'refused' | 'stream-exhausted',
  at = RECORDED,
): ConversationLogEntry => ({ kind: 'local', at, fact })

const item = (
  over: Partial<ExecutionConversationItem> & { id: string },
): ExecutionConversationItem =>
  ({
    kind: 'message',
    actor: 'assistant',
    text: '',
    state: 'streaming',
    createdAt: CREATED,
    updatedAt: CREATED,
    providerMeta: {
      providerId: 'claude',
      providerItemId: null,
      providerEventType: null,
    },
    ...over,
  }) as ExecutionConversationItem

describe('emptyFold', () => {
  /**
   * A log that says nothing describes a conversation nobody is waiting on.
   *
   * Seeding `running` here was H2's engine: a start the daemon refused left an
   * empty log, and every launch afterwards folded that silence into "Working" —
   * a composer locked forever against a session that never existed.
   *
   * Mutation: seed `status: 'running'` -> red here and in the refused-start
   * replay below.
   */
  it('starts idle, because an empty log says nothing happened', () => {
    expect(emptyFold(CREATED)).toEqual({
      status: 'idle',
      items: [],
      lastSeq: 0,
      updatedAt: CREATED,
      orphanPatches: 0,
      lastFact: null,
    })
  })
})

/**
 * The facts the wire never carries, folded by the same function as the wire's
 * own (MAR-2770 H2).
 */
describe('local lifecycle facts', () => {
  /**
   * Mutation: fold `sent` to anything but `running` and a conversation whose
   * turn was posted comes back sendable, with the composer inviting a second
   * message into a session already working -> red.
   */
  it('makes a posted turn read as working, and dates it', () => {
    const fold = applyEntry(emptyFold(CREATED), local('sent'))
    expect(fold.status).toBe('running')
    expect(fold.updatedAt).toBe(RECORDED)
  })

  /**
   * The zombie, replayed exactly as a restart replays it: a turn posted, a
   * daemon that would not take it, and nothing else in the log.
   *
   * Mutation: fold `refused` to `running` (or drop the arm so it falls through
   * unchanged) and the restart shows Working with a locked composer, which is
   * the whole defect -> red on both halves.
   */
  it('replays a refused start as failed, and sendable', () => {
    const fold = foldEntries(emptyFold(CREATED), [
      local('sent'),
      local('refused'),
    ])
    expect(fold.status).toBe('failed')
    expect(fold.updatedAt).toBe(RECORDED)
  })

  /**
   * `refused` and `stream-exhausted` are the same STATUS and opposite facts:
   * one says the daemon never made this session, the other says it did and the
   * stream to it could not be rebuilt. `send` reads which, because a command
   * posted to a session that was never created can only 404 — so the fold has
   * to carry the fact and not merely what it did to the status.
   *
   * Mutation: leave `lastFact` alone in `applyLocalFact` (or set it from
   * `sent` only) and the two become indistinguishable -> red.
   */
  it('remembers which fact it was, not only what it did to the status', () => {
    const refused = foldEntries(emptyFold(CREATED), [
      local('sent'),
      local('refused'),
    ])
    const exhausted = foldEntries(emptyFold(CREATED), [
      local('sent'),
      local('stream-exhausted'),
    ])
    expect(refused.status).toBe(exhausted.status)
    expect(refused.lastFact).toBe('refused')
    expect(exhausted.lastFact).toBe('stream-exhausted')
    expect(applyEntry(refused, local('sent')).lastFact).toBe('sent')
  })

  /**
   * Mutation: fold `stream-exhausted` to `running` and a conversation whose
   * daemon vanished stays Working across every restart, refusing every
   * follow-up -> red.
   */
  it('replays an abandoned stream as failed, and sendable', () => {
    const fold = foldEntries(emptyFold(CREATED), [
      local('sent'),
      local('stream-exhausted'),
    ])
    expect(fold.status).toBe('failed')
  })

  /**
   * A local fact is not an envelope and must not touch the resume point: it
   * has no sequence, and moving the high-water mark for one would ask the
   * daemon to skip an event it never sent.
   *
   * Mutation: give the local arm `lastSeq: fold.lastSeq + 1` -> red.
   */
  it('never moves the high-water mark', () => {
    const seeded = applyEntry(
      emptyFold(CREATED),
      entry(wire({ kind: 'heartbeat' })),
    )
    const after = applyEntry(seeded, local('sent'))
    expect(after.lastSeq).toBe(seeded.lastSeq)
  })

  /**
   * The wire still wins where it speaks: a daemon that says `completed` after
   * we said `sent` is the answer, and the fold takes the LAST word rather than
   * preferring its own.
   *
   * Mutation: apply local facts after wire entries (sort the reduce) -> red.
   */
  it('lets the daemon overrule a local fact that came before it', () => {
    const fold = foldEntries(emptyFold(CREATED), [
      local('sent'),
      entry(wire({ kind: 'status', status: 'completed' })),
    ])
    expect(fold.status).toBe('idle')
  })
})

describe('applyEnvelope', () => {
  it('reads the session status off a status event', () => {
    const fold = applyEnvelope(
      emptyFold(CREATED),
      wire({ kind: 'status', status: 'completed' }),
    )
    expect(fold.status).toBe('idle')
    expect(fold.lastSeq).toBeGreaterThan(0)
  })

  /**
   * A status event changes what the list row says, so it changes when that row
   * was last updated. The protocol's envelope carries no time of its own, so
   * the log line's own is the only clock there is.
   *
   * Mutation: drop `updatedAt: recordedAt ?? next.updatedAt` from the status
   * arm and a conversation that just finished still shows the time of whatever
   * last happened to carry one -> red.
   */
  it('dates a status event by the line that recorded it', () => {
    const fold = applyEntry(
      emptyFold(CREATED),
      entry(wire({ kind: 'status', status: 'completed' })),
    )
    expect(fold.updatedAt).toBe(RECORDED)
  })

  /**
   * A line written before entries carried a time has none, and inventing one
   * would date a conversation by when it was read back.
   *
   * Mutation: `updatedAt: recordedAt ?? new Date().toISOString()` -> red.
   */
  it('leaves the time alone for a line that never recorded one', () => {
    const fold = applyEntry(
      emptyFold(CREATED),
      entry(wire({ kind: 'status', status: 'completed' }), null),
    )
    expect(fold.updatedAt).toBe(CREATED)
  })

  it('reads the session status off a session patch', () => {
    const fold = applyEnvelope(
      emptyFold(CREATED),
      delta({ kind: 'session.patch', patch: { status: 'failed' } }),
    )
    expect(fold.status).toBe('failed')
  })

  /**
   * Every signal this beat has no reader for still advances the high-water
   * mark, or a resume would ask for them again forever.
   *
   * Mutation: `return fold` instead of `return next` in the default arm -> red.
   */
  it('counts an unread signal towards the resume point', () => {
    const envelope = wire({ kind: 'heartbeat' })
    const fold = applyEnvelope(emptyFold(CREATED), envelope)
    expect(fold.lastSeq).toBe(envelope.seq)
    expect(fold.items).toEqual([])
  })

  /**
   * A daemon replay re-delivers what a resume already holds.
   *
   * Mutation: drop the `envelope.seq <= fold.lastSeq` guard and the replayed
   * add lands a second time -> red on the item count.
   */
  it('ignores an envelope at or below the high-water mark', () => {
    const add = delta({
      kind: 'conversation.item.add',
      item: item({ id: 'i-1' }),
    })
    const once = applyEnvelope(emptyFold(CREATED), add)
    const twice = applyEnvelope(once, add)
    expect(twice).toBe(once)
    expect(twice.items).toHaveLength(1)
  })

  /**
   * The same fact from the other direction: a *higher* sequence carrying an id
   * already held replaces the row rather than appending a twin. The daemon
   * re-sends a full item after a resume it cannot be sure we saw.
   *
   * Mutation: make the add arm always `[...fold.items, item]` -> red.
   */
  it('replaces an item it already holds rather than doubling it', () => {
    const first = applyEnvelope(
      emptyFold(CREATED),
      delta({
        kind: 'conversation.item.add',
        item: item({ id: 'i-1', text: 'half' }),
      }),
    )
    const again = applyEnvelope(
      first,
      delta({
        kind: 'conversation.item.add',
        item: item({ id: 'i-1', text: 'whole', state: 'complete' }),
      }),
    )
    expect(again.items).toHaveLength(1)
    expect(again.items[0]).toMatchObject({ text: 'whole', state: 'complete' })
  })
})

describe('conversation item patches', () => {
  const withItem = (text: string) =>
    applyEnvelope(
      emptyFold(CREATED),
      delta({
        kind: 'conversation.item.add',
        item: item({ id: 'i-1', text }),
      }),
    )

  it('applies a full-text patch', () => {
    const fold = applyEnvelope(
      withItem('Hel'),
      delta({
        kind: 'conversation.item.patch',
        itemId: 'i-1',
        patch: { text: 'Hello there', state: 'complete' },
      }),
    )
    expect(fold.items[0]).toMatchObject({
      text: 'Hello there',
      state: 'complete',
    })
  })

  it('appends when the daemon sends an append', () => {
    const fold = applyEnvelope(
      withItem('Hel'),
      delta({
        kind: 'conversation.item.patch',
        itemId: 'i-1',
        patch: { textAppend: 'lo' },
      }),
    )
    expect(fold.items[0].text).toBe('Hello')
  })

  /**
   * The protocol's own rule: when both arrive, `text` is authoritative and
   * `textAppend` is redundant. Merging them would double the tail of a reply.
   *
   * Mutation: check `textAppend` before `text` -> red.
   */
  it('prefers the full text when a patch carries both', () => {
    // The two must not agree, or the assertion holds whichever branch runs
    // first: 'Hel' + 'lo' and 'Hello' are the same string, and a fixture built
    // that way passed with the precedence reversed.
    const fold = applyEnvelope(
      withItem('Hel'),
      delta({
        kind: 'conversation.item.patch',
        itemId: 'i-1',
        patch: { text: 'Hello', textAppend: ' AND MORE' },
      }),
    )
    expect(fold.items[0].text).toBe('Hello')
  })

  /**
   * The patch type is a union across item kinds, and the field carrying a tool
   * call's text is `inputText`, not `text`. Reading only `text` applied message
   * patches and silently dropped every update to a tool row, which then sat at
   * whatever its `add` first carried while looking complete.
   *
   * Mutation: read `patch.text` for every kind in `patchedText` and both of
   * these go red.
   */
  it.each([
    ['tool-call', 'inputText', { toolName: 'Bash', inputText: 'ls' }],
    [
      'tool-result',
      'outputText',
      { toolName: 'Bash', relatedItemId: null, outputText: 'a' },
    ],
  ])('patches a %s through its own text field', (kind, field, shape) => {
    const added = applyEnvelope(
      emptyFold(CREATED),
      delta({
        kind: 'conversation.item.add',
        item: item({ id: 'i-1', kind, ...shape } as never),
      }),
    )
    const patched = applyEnvelope(
      added,
      delta({
        kind: 'conversation.item.patch',
        itemId: 'i-1',
        patch: { [field]: 'the whole output' } as never,
      }),
    )
    expect(patched.items[0].text).toBe('the whole output')
  })

  /**
   * A state the protocol does not have must not reach a row: the window
   * branches on exactly three, and a fourth would render as neither.
   *
   * Mutation: `state: patch.state ?? current.state` -> red.
   */
  it('ignores a state it does not recognise', () => {
    const added = applyEnvelope(
      emptyFold(CREATED),
      delta({
        kind: 'conversation.item.add',
        item: item({ id: 'i-1', text: 'x' }),
      }),
    )
    const patched = applyEnvelope(
      added,
      delta({
        kind: 'conversation.item.patch',
        itemId: 'i-1',
        patch: { state: 'nonsense' } as never,
      }),
    )
    expect(patched.items[0].state).toBe('streaming')
  })

  /**
   * A patch naming an item nothing introduced cannot be applied, and a drop
   * with nobody to tell is a defect of its own.
   *
   * Mutation: `return fold` without incrementing `orphanPatches` and the
   * transcript silently loses a reply -> red.
   */
  it('counts a patch for an item no add introduced', () => {
    const fold = applyEnvelope(
      emptyFold(CREATED),
      delta({
        kind: 'conversation.item.patch',
        itemId: 'nobody',
        patch: { text: 'x' },
      }),
    )
    expect(fold.orphanPatches).toBe(1)
    expect(fold.items).toEqual([])
  })
})

describe('foldEnvelopes', () => {
  /**
   * The load-bearing claim of the whole record: replaying a log produces the
   * conversation that was on screen. One function does both, so this drives the
   * live path entry by entry and the replay path in one call, and the two
   * results must be identical.
   *
   * The seed is deliberately NOT `emptyFold`. The earlier form of this test
   * seeded both sides with `emptyFold(CREATED)`, which made its own stated
   * mutation — seeding the reduce with `emptyFold` instead of the caller's seed
   * — a rewrite of one expression into an identical one: the test compared a
   * value with itself and could not fail. A seed carrying items, a status and a
   * high-water mark of its own is the only shape that can tell the two apart.
   *
   * Mutation: `entries.reduce(applyEntry, emptyFold(''))` in `foldEntries` ->
   * red. Mutation: any divergence between `applyEntry` and the reduce -> red.
   */
  it('replays a log into exactly the fold the live path built', () => {
    const log = [
      wire({ kind: 'status', status: 'running' }),
      delta({
        kind: 'conversation.item.add',
        item: item({
          id: 'u-1',
          kind: 'message',
          actor: 'user',
          text: 'hi',
          state: 'complete',
        }),
      }),
      delta({
        kind: 'conversation.item.add',
        item: item({ id: 'a-1', text: 'H' }),
      }),
      delta({
        kind: 'conversation.item.patch',
        itemId: 'a-1',
        patch: { text: 'Hello', state: 'complete' },
      }),
      wire({ kind: 'status', status: 'completed' }),
    ]

    const entries = [local('sent'), ...log.map((envelope) => entry(envelope))]

    // A seed with a history of its own: a row already held, a status that is
    // not the empty fold's, and a high-water mark a replay must respect.
    const seed: ConversationFold = {
      status: 'failed',
      items: [
        {
          id: 'earlier',
          kind: 'message',
          actor: 'assistant',
          label: 'Assistant',
          text: 'from an earlier turn',
          state: 'complete',
        },
      ],
      lastSeq: 0,
      updatedAt: CREATED,
      orphanPatches: 3,
      lastFact: null,
    }

    let live = seed
    for (const one of entries) live = applyEntry(live, one)
    const replayed = foldEntries(seed, entries)

    expect(replayed).toEqual(live)
    expect(replayed.status).toBe('idle')
    // The seed's own history survived the replay — the half that a reduce
    // starting from `emptyFold` would silently destroy.
    expect(replayed.orphanPatches).toBe(3)
    expect(replayed.items.map((row) => [row.label, row.text])).toEqual([
      ['Assistant', 'from an earlier turn'],
      ['You', 'hi'],
      ['Assistant', 'Hello'],
    ])
  })
})

describe('conversationStatusFrom', () => {
  /**
   * Mutation: map `failed` to `idle` and a broken conversation becomes one that
   * looks merely finished -> red.
   */
  it('keeps failure distinguishable from finished', () => {
    expect(
      (['running', 'idle', 'completed', 'failed'] as const).map(
        conversationStatusFrom,
      ),
    ).toEqual(['running', 'idle', 'idle', 'failed'])
  })
})

describe('projectItem', () => {
  it('gives every wire kind a row of its own', () => {
    const rows = [
      item({ id: '1', kind: 'message', actor: 'user', text: 'hi' }),
      item({ id: '2', kind: 'thinking', actor: 'assistant', text: 'hmm' }),
      item({ id: '3', kind: 'tool-call', toolName: 'Bash', inputText: 'ls' }),
      item({
        id: '4',
        kind: 'tool-result',
        toolName: null,
        relatedItemId: null,
        outputText: 'out',
      }),
      item({ id: '5', kind: 'approval-request', description: 'may I' }),
      item({ id: '6', kind: 'input-request', prompt: 'which one' }),
      item({ id: '7', kind: 'note', level: 'error', text: 'boom' }),
    ] as ExecutionConversationItem[]

    expect(
      rows.map(projectItem).map((row) => [row.kind, row.label, row.text]),
    ).toEqual([
      ['message', 'You', 'hi'],
      ['thinking', 'Thinking', 'hmm'],
      ['tool-call', 'Tool · Bash', 'ls'],
      ['tool-result', 'Result · tool', 'out'],
      ['approval-request', 'Approval requested', 'may I'],
      ['input-request', 'Input requested', 'which one'],
      ['note', 'Note · error', 'boom'],
    ])
  })

  /**
   * A projection, never a summary — the row's text is the wire's text, byte for
   * byte, because this run has no Narrator (constitution law 3).
   *
   * Mutation: truncate the text in `projectItem` and this goes red.
   */
  it('carries the wire text unchanged', () => {
    const long = 'x'.repeat(5_000)
    expect(projectItem(item({ id: '1', text: long })).text).toBe(long)
  })
})

describe('conversationTitleFrom', () => {
  it("takes the person's first sentence", () => {
    expect(conversationTitleFrom('Build me a page. Then style it.')).toBe(
      'Build me a page.',
    )
  })

  it('collapses whitespace and keeps a sentence-less message whole', () => {
    expect(conversationTitleFrom('  make   a\nlanding page  ')).toBe(
      'make a landing page',
    )
  })

  /**
   * Mutation: drop the length cap and one pasted paragraph becomes the whole
   * list row -> red.
   */
  it('shortens a very long sentence', () => {
    const title = conversationTitleFrom('word '.repeat(100))
    expect(title.length).toBeLessThanOrEqual(80)
    expect(title.endsWith('…')).toBe(true)
  })

  it('never returns an empty name', () => {
    expect(conversationTitleFrom('   ')).toBe('Untitled conversation')
  })
})
