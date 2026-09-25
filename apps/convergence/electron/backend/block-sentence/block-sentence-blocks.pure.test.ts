import { describe, expect, it } from 'vitest'
import { groupWorkBlocks } from '../../../src/entities/session/work-blocks.pure'
import type { ConversationItem } from '../session/conversation-item.types'
import { blocksToDescribe, turnWorkBlocks } from './block-sentence-blocks.pure'

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
