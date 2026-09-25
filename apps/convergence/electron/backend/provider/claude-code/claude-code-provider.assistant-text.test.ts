import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: queryMock }))
vi.mock('../../provider-account/provider-account-env.service', () => ({
  resolveClaudeAccountEnv: async () => ({}),
}))
vi.mock('./claude-context-log.service', () => ({
  readClaudeLoggedContextWindow: () => null,
}))
vi.mock('./claude-skill-telemetry.service', () => ({
  startClaudeSkillTelemetrySink: async () => null,
}))

import { ClaudeCodeProvider } from './claude-code-provider'

type Item = Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']

afterEach(() => queryMock.mockReset())

async function replay(events: unknown[]): Promise<Item[]> {
  let close = () => {}
  const closed = new Promise<void>((resolve) => {
    close = resolve
  })
  queryMock.mockImplementation(({ prompt }) => ({
    async *[Symbol.asyncIterator]() {
      await prompt[Symbol.asyncIterator]().next()
      yield* events
      await closed
    },
    close: () => close(),
  }))
  const handle = new ClaudeCodeProvider('/fixture/claude').start({
    sessionId: 'assistant-text-fixture',
    workingDirectory: '/fixture',
    initialMessage: 'Read files in batches with a note between them',
    model: null,
    effort: null,
    continuationToken: null,
  })
  const items = new Map<string, Item>()
  const statuses: string[] = []
  handle.onDelta((delta) => {
    if (delta.kind === 'conversation.item.add')
      items.set(delta.item.id, delta.item)
    if (delta.kind === 'conversation.item.patch') {
      const item = items.get(delta.itemId)
      if (item) items.set(item.id, { ...item, ...delta.patch } as Item)
    }
  })
  handle.onStatusChange((status) => statuses.push(status))
  try {
    await vi.waitFor(() => expect(statuses).toContain('completed'))
    return [...items.values()]
  } finally {
    await handle.dispose?.()
  }
}

function batch(message: number, count: number, streamed: boolean): unknown[] {
  const text = `Note ${message}`
  const tools = Array.from({ length: count }, (_, index) => ({
    type: 'tool_use',
    id: `tool-${message}-${index}`,
    name: 'Read',
    input: { file_path: `/fixture/file-${index}.ts` },
  }))
  return [
    ...(streamed
      ? [
          {
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: 'Note ' },
            },
          },
          {
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: String(message) },
            },
          },
        ]
      : []),
    {
      type: 'assistant',
      uuid: `assistant-${message}`,
      message: {
        id: `message-${message}`,
        content: [{ type: 'text', text }, ...tools],
      },
    },
    {
      type: 'user',
      message: {
        content: tools.map((tool) => ({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: 'file contents',
        })),
      },
    },
  ]
}

const result = { type: 'result', is_error: false, result: 'Note 2' }

describe('Claude assistant text between parallel tool batches', () => {
  it.each([
    { shape: 'without text deltas', first: false, second: false },
    { shape: 'with text deltas', first: true, second: true },
    {
      shape: 'with only the first message streamed',
      first: true,
      second: false,
    },
    {
      shape: 'with only the second message streamed',
      first: false,
      second: true,
    },
  ])('keeps both notes once and in order $shape', async ({ first, second }) => {
    const items = await replay([
      ...batch(1, 3, first),
      ...batch(2, 4, second),
      result,
    ])
    const conversation = items.filter(
      (item) => item.kind !== 'message' || item.actor === 'assistant',
    )
    expect(
      conversation.map((item) =>
        item.kind === 'message' ? item.text : item.kind,
      ),
    ).toEqual([
      'Note 1',
      'tool-call',
      'tool-call',
      'tool-call',
      'tool-result',
      'tool-result',
      'tool-result',
      'Note 2',
      'tool-call',
      'tool-call',
      'tool-call',
      'tool-call',
      'tool-result',
      'tool-result',
      'tool-result',
      'tool-result',
    ])
    expect(
      conversation
        .filter((item) => item.kind === 'message')
        .map((item) => item.state),
    ).toEqual(['complete', 'complete'])
  })

  it('keeps the result fallback when no assistant text was emitted', async () => {
    const items = await replay([result])
    expect(
      items.filter(
        (item) => item.kind === 'message' && item.actor === 'assistant',
      ),
    ).toMatchObject([{ text: 'Note 2', state: 'complete' }])
  })
})
