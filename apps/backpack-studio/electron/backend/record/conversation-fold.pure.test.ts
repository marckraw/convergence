import { describe, expect, it } from 'vitest'
import {
  EXECUTION_PROTOCOL_VERSION,
  type ExecutionConversationItem,
  type ExecutionHostEventEnvelope,
  type ExecutionSessionDelta,
} from '@mrck-labs/execution-host-protocol'
import {
  applyEnvelope,
  conversationStatusFrom,
  conversationTitleFrom,
  emptyFold,
  foldEnvelopes,
  projectItem,
} from './conversation-fold.pure'

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
   * A conversation is running from the moment it is created — the start has
   * been posted and the daemon has not spoken yet. Calling it idle would invite
   * a follow-up into a session about to answer.
   *
   * Mutation: seed `status: 'idle'` -> red.
   */
  it('starts running, not idle', () => {
    expect(emptyFold(CREATED)).toEqual({
      status: 'running',
      items: [],
      lastSeq: 0,
      updatedAt: CREATED,
      orphanPatches: 0,
    })
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
   * live path envelope by envelope and the replay path in one call, and the two
   * results must be identical.
   *
   * Mutation: any divergence between `applyEnvelope` and the reduce — say,
   * seeding the reduce with `emptyFold` instead of the caller's seed — turns
   * this red.
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

    const live = log.reduce(applyEnvelope, emptyFold(CREATED))
    const replayed = foldEnvelopes(emptyFold(CREATED), log)

    expect(replayed).toEqual(live)
    expect(replayed.status).toBe('idle')
    expect(replayed.items.map((row) => [row.label, row.text])).toEqual([
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
