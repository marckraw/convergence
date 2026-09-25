import { describe, expect, it } from 'vitest'
import { groupWorkBlocks } from '../../../src/entities/session/work-blocks.pure'
import type { ConversationItem } from '../session/conversation-item.types'
import {
  blocksToDescribe,
  closedBlocksSince,
  closesWorkBlock,
  turnWorkBlocks,
} from './block-sentence-blocks.pure'

let sequence = 0

function base(id: string, agentRunId: string | null = null) {
  sequence += 1
  return {
    id,
    sessionId: 's1',
    sequence,
    turnId: 't1',
    agentRunId,
    state: 'complete' as const,
    createdAt: '2026-09-25T00:00:00.000Z',
    updatedAt: '2026-09-25T00:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: 'tool-use',
    },
  }
}

const call = (id: string, agentRunId: string | null = null) =>
  ({
    ...base(id, agentRunId),
    kind: 'tool-call',
    toolName: 'Read',
    inputText: `{"file_path":"src/${id}.ts"}`,
  }) satisfies ConversationItem

const answer = (id: string, relatedItemId: string) =>
  ({
    ...base(id),
    kind: 'tool-result',
    toolName: 'Read',
    relatedItemId,
    outputText: 'ok',
  }) satisfies ConversationItem

const thinking = (id: string) =>
  ({
    ...base(id),
    kind: 'thinking',
    actor: 'assistant',
    text: 'hmm',
  }) satisfies ConversationItem

const say = (id: string) =>
  ({
    ...base(id),
    kind: 'message',
    actor: 'assistant',
    text: 'done',
  }) satisfies ConversationItem

describe('one fold rule, two users (R1)', () => {
  const items: ConversationItem[] = [
    { ...base('user'), kind: 'message', actor: 'user', text: 'go' },
    call('a'),
    answer('a-r', 'a'),
    thinking('think'),
    call('b'),
    answer('b-r', 'b'),
    say('say-1'),
    call('c'),
    { ...base('err'), kind: 'tool-call', toolName: 'Bash', inputText: 'x' },
    say('say-2'),
  ]
  items[8] = { ...items[8]!, state: 'error' } as ConversationItem

  it('gives main exactly the blocks the renderer folds from the same items', () => {
    const renderer = groupWorkBlocks(items, (item) => item).flatMap((row) =>
      row.kind === 'block'
        ? [{ id: row.id, members: row.members.map((item) => item.id) }]
        : [],
    )
    expect(
      turnWorkBlocks(items).map((block) => ({
        id: block.firstItemId,
        members: block.members.map((item) => item.id),
      })),
    ).toEqual(renderer)
    expect(turnWorkBlocks(items)).toEqual([
      {
        firstItemId: 'a',
        lastItemId: 'b-r',
        members: items.slice(1, 6),
      },
      { firstItemId: 'c', lastItemId: 'c', members: [items[7]] },
    ])
  })

  it('leaves the subagents’ own work to the sidebar', () => {
    const withAgent: ConversationItem[] = [
      call('a'),
      call('sub', 'agent-1'),
      call('b'),
      call('c'),
    ]
    expect(
      turnWorkBlocks(withAgent).map((block) =>
        block.members.map((item) => item.id),
      ),
    ).toEqual([['a', 'b', 'c']])
  })
})

describe('which blocks are asked about (R2)', () => {
  it('only blocks of three or more, not yet described, at most twenty', () => {
    const items: ConversationItem[] = []
    for (let block = 0; block < 25; block += 1) {
      items.push(call(`b${block}-0`), call(`b${block}-1`))
      if (block !== 3) items.push(call(`b${block}-2`))
      items.push(say(`say-${block}`))
    }
    const picked = blocksToDescribe(items, (id) => id === 'b0-0')
    expect(picked).toHaveLength(20)
    expect(picked.map((block) => block.firstItemId)).not.toContain('b0-0')
    expect(picked.map((block) => block.firstItemId)).not.toContain('b3-0')
    expect(picked[0]!.firstItemId).toBe('b1-0')
  })
})

describe('a block closes when a boundary follows it (MAR-3422 CV3d R1)', () => {
  const user = () =>
    ({
      ...base('user'),
      kind: 'message',
      actor: 'user',
      text: 'go',
    }) satisfies ConversationItem

  /** Folds a live turn the way the service does: from each cursor on. */
  function foldAsRecorded(items: readonly ConversationItem[]) {
    let cursor = 0
    const asked: string[][] = []
    items.forEach((item, index) => {
      if (!closesWorkBlock(item)) return
      const since = items
        .slice(0, index + 1)
        .filter((candidate) => candidate.sequence > cursor)
      const folded = closedBlocksSince(since)
      if (folded.cursor !== null) cursor = folded.cursor
      for (const block of folded.blocks)
        asked.push(block.members.map((member) => member.id))
    })
    return asked
  }

  it('hands out exactly the renderer’s closed blocks of three or more, each once', () => {
    // Built in order: an item's sequence is its place in the turn.
    const errored = () =>
      ({
        ...base('err'),
        kind: 'tool-call',
        toolName: 'Bash',
        inputText: 'x',
        state: 'error',
      }) as ConversationItem
    const items: ConversationItem[] = [
      user(),
      call('a'),
      answer('a-r', 'a'),
      thinking('think'),
      call('b'),
      call('sub', 'agent-1'),
      { ...say('sub-say'), agentRunId: 'agent-1' },
      answer('b-r', 'b'),
      say('say-1'),
      call('c'),
      call('d'),
      say('say-2'),
      call('e'),
      call('f'),
      call('g'),
      errored(),
      call('h'),
      call('i'),
      call('j'),
      thinking('think-2'),
      say('say-3'),
      call('trailing-1'),
      call('trailing-2'),
      call('trailing-3'),
    ]
    const visible = items.filter((item) => item.agentRunId === null)
    const lastBoundary = visible.reduce(
      (last, item, index) =>
        item.kind === 'message' || item.state === 'error' ? index : last,
      -1,
    )
    const renderer = groupWorkBlocks(visible, (item) => item).flatMap((row) =>
      row.kind === 'block' &&
      row.members.length >= 3 &&
      visible.indexOf(row.members.at(-1)!) < lastBoundary
        ? [row.members.map((item) => item.id)]
        : [],
    )
    expect(renderer).toEqual([
      ['a', 'a-r', 'think', 'b', 'b-r'],
      ['e', 'f', 'g'],
      ['h', 'i', 'j'],
    ])
    expect(foldAsRecorded(items)).toEqual(renderer)
  })

  it('thinking does not close a block; only a boundary does', () => {
    const items = [user(), call('a'), call('b'), call('c'), thinking('t')]
    expect(closesWorkBlock(items[4]!)).toBe(false)
    expect(closedBlocksSince(items)).toEqual({
      blocks: [],
      cursor: items[0]!.sequence,
    })
    const closing = say('said')
    expect(closesWorkBlock(closing)).toBe(true)
    expect(
      closedBlocksSince([...items, closing]).blocks.map(
        (block) => block.firstItemId,
      ),
    ).toEqual(['a'])
  })

  it('a subagent’s message closes nothing', () => {
    expect(closesWorkBlock({ ...say('sub-say'), agentRunId: 'agent-1' })).toBe(
      false,
    )
  })

  it('a block with a streaming member waits, and so does every block after it', () => {
    const items = [
      user(),
      call('a'),
      { ...thinking('streaming'), state: 'streaming' } as ConversationItem,
      call('b'),
      call('c'),
      say('before-stuck'),
      call('d'),
      call('e'),
      call('f'),
      say('after'),
    ]
    const folded = closedBlocksSince(items)
    expect(folded.blocks).toEqual([])
    // The cursor stays at the last boundary before the stuck block.
    expect(folded.cursor).toBe(items[0]!.sequence)

    // Once it settles, both blocks are handed out, in order.
    const settled = items.map((item) =>
      item.id === 'streaming' ? { ...item, state: 'complete' } : item,
    ) as ConversationItem[]
    expect(
      closedBlocksSince(settled).blocks.map((block) => block.firstItemId),
    ).toEqual(['a', 'd'])
  })

  it('no boundary: the cursor stands', () => {
    expect(closedBlocksSince([call('x'), call('y')])).toEqual({
      blocks: [],
      cursor: null,
    })
  })
})
