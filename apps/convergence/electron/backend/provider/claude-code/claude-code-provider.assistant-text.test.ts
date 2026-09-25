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

type Shape = 'per-block' | 'whole-message'
type Block =
  | { type: 'thinking'; thinking: string }
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }

function assistantEvents(
  message: number,
  blocks: Block[],
  streamed: boolean,
  shape: Shape,
): unknown[] {
  const events: unknown[] = []
  const complete = (content: Block[], index: number) => ({
    type: 'assistant',
    uuid: `assistant-${message}-${index}`,
    message: { id: `message-${message}`, content },
  })
  if (streamed) {
    events.push({
      type: 'stream_event',
      event: { type: 'message_start', message: { id: `message-${message}` } },
    })
  }
  blocks.forEach((block, index) => {
    if (streamed) {
      events.push({
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index,
          content_block:
            block.type === 'thinking'
              ? { type: 'thinking', thinking: '', signature: '' }
              : block.type === 'text'
                ? { type: 'text', text: '' }
                : { ...block, input: {} },
        },
      })
      if (block.type !== 'tool_use') {
        const value = block.type === 'thinking' ? block.thinking : block.text
        for (const chunk of [value.slice(0, 3), value.slice(3)]) {
          events.push({
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              index,
              delta:
                block.type === 'thinking'
                  ? { type: 'thinking_delta', thinking: chunk }
                  : { type: 'text_delta', text: chunk },
            },
          })
        }
      }
      events.push({
        type: 'stream_event',
        event: { type: 'content_block_stop', index },
      })
    }
    // The SDK emits one assistant event per completed block, sharing message.id.
    if (shape === 'per-block') events.push(complete([block], index))
  })
  if (shape === 'whole-message') events.push(complete(blocks, 0))
  if (streamed) {
    events.push({ type: 'stream_event', event: { type: 'message_stop' } })
  }
  return events
}

function batch(
  message: number,
  count: number,
  streamed: boolean,
  shape: Shape,
): unknown[] {
  const text = `Note ${message}`
  const tools = Array.from({ length: count }, (_, index) => ({
    type: 'tool_use' as const,
    id: `tool-${message}-${index}`,
    name: 'Read',
    input: { file_path: `/fixture/file-${index}.ts` },
  }))
  return [
    ...assistantEvents(
      message,
      [{ type: 'text', text }, ...tools],
      streamed,
      shape,
    ),
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

describe.each<Shape>(['per-block', 'whole-message'])(
  'Claude assistant %s events',
  (shape) => {
    it.each([
      { mode: 'without text deltas', first: false, second: false },
      { mode: 'with text deltas', first: true, second: true },
      {
        mode: 'with only the first message streamed',
        first: true,
        second: false,
      },
      {
        mode: 'with only the second message streamed',
        first: false,
        second: true,
      },
    ])(
      'keeps both notes once and in order $mode',
      async ({ first, second }) => {
        const items = await replay([
          ...batch(1, 3, first, shape),
          ...batch(2, 4, second, shape),
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
      },
    )

    it('keeps multiple complete-only thinking blocks in one message', async () => {
      const items = await replay([
        ...assistantEvents(
          1,
          [
            { type: 'thinking', thinking: 'Think 1' },
            { type: 'thinking', thinking: 'Think 2' },
            { type: 'text', text: 'Note 2' },
          ],
          false,
          shape,
        ),
        result,
      ])
      expect(
        items
          .filter((item) => item.kind === 'thinking')
          .map((item) => item.text),
      ).toEqual(['Think 1', 'Think 2'])
    })

    it.each([
      {
        mode: 'with only the first message streamed',
        first: true,
        second: false,
      },
      { mode: 'with both messages streamed', first: true, second: true },
      { mode: 'without deltas', first: false, second: false },
      {
        mode: 'with only the second message streamed',
        first: false,
        second: true,
      },
    ])(
      'keeps thinking and text once and in order $mode',
      async ({ first, second }) => {
        const message = (id: number, streamed: boolean) =>
          assistantEvents(
            id,
            [
              { type: 'thinking', thinking: `Think ${id}` },
              { type: 'text', text: `Note ${id}` },
            ],
            streamed,
            shape,
          )
        const items = await replay([
          ...message(1, first),
          ...message(2, second),
          result,
        ])
        expect(
          items.filter(
            (item) =>
              item.kind === 'thinking' ||
              (item.kind === 'message' && item.actor === 'assistant'),
          ),
        ).toMatchObject([
          { kind: 'thinking', text: 'Think 1', state: 'complete' },
          { kind: 'message', text: 'Note 1', state: 'complete' },
          { kind: 'thinking', text: 'Think 2', state: 'complete' },
          { kind: 'message', text: 'Note 2', state: 'complete' },
        ])
      },
    )

    it('keeps the result fallback when no assistant text was emitted', async () => {
      const items = await replay([result])
      expect(
        items.filter(
          (item) => item.kind === 'message' && item.actor === 'assistant',
        ),
      ).toMatchObject([{ text: 'Note 2', state: 'complete' }])
    })
  },
)
