import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ConversationItem, Session } from '@/entities/session'
import { useSessionStore } from '@/entities/session'
import { ChatSurface } from './chat-surface.container'

// The transcript is the real one; only the parts with IO or layout physics
// that jsdom cannot give are stood in for.
vi.mock('@/features/composer', () => ({
  ComposerContainer: () => <div data-testid="composer" />,
}))
vi.mock('@/features/command-center', () => ({ switchToSession: vi.fn() }))
vi.mock('@/widgets/session-view/use-parallel-work', () => ({
  useParallelWork: () => ({
    rows: [],
    error: null,
    loading: false,
    hasRecord: true,
    retry: vi.fn(),
  }),
  useParallelWorkDetail: () => ({ items: [], error: null }),
  useParallelWorkResults: () => ({ items: [], error: null }),
}))
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: {
    count: number
    estimateSize: (index: number) => number
    getItemKey?: (index: number) => string | number | bigint
  }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        key: options.getItemKey?.(index) ?? index,
        start: index * options.estimateSize(index),
      })),
    getTotalSize: () => options.count * 160,
    measureElement: () => {},
    scrollToIndex: vi.fn(),
  }),
}))

const chat: Session = {
  id: 'global-cv1',
  contextKind: 'global',
  projectId: null,
  workspaceId: null,
  providerId: 'claude-code',
  model: 'sonnet',
  effort: 'medium',
  name: 'Planning chat',
  status: 'completed',
  attention: 'none',
  activity: null,
  workingDirectory: '/tmp/global',
  contextWindow: null,
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const item = (
  id: string,
  sequence: number,
  rest: Record<string, unknown>,
): ConversationItem =>
  ({
    id,
    sessionId: chat.id,
    sequence,
    turnId: 'turn-1',
    state: 'complete',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: null,
    },
    ...rest,
  }) as ConversationItem

const conversation = [
  item('u1', 1, { kind: 'message', actor: 'user', text: 'look around' }),
  item('r1', 2, {
    kind: 'tool-call',
    toolName: 'Read',
    inputText: JSON.stringify({ file_path: '/tmp/global/a.md' }),
  }),
  item('r2', 3, {
    kind: 'tool-call',
    toolName: 'Read',
    inputText: JSON.stringify({ file_path: '/tmp/global/b.md' }),
  }),
  item('m1', 4, { kind: 'message', actor: 'assistant', text: 'done' }),
]

beforeEach(() => {
  localStorage.clear()
  useSessionStore.setState({
    globalChatSessions: [chat],
    activeGlobalSessionId: chat.id,
    activeGlobalConversation: conversation,
    activeGlobalConversationSessionId: chat.id,
    approveSession: vi.fn(),
    denySession: vi.fn(),
    stopSession: vi.fn(),
  })
})

const toolRows = () =>
  ['r1', 'r2'].filter((id) =>
    document.querySelector(`[data-conversation-item-id="${id}"]`),
  )

it('MAR-3391 R5 E a global chat that folds has the Compact/Full switch, and Full shows every entry — mutation drop the switch from the chat header turns red', () => {
  render(<ChatSurface selectedSpaceId={null} />)
  const switchGroup = screen.getByRole('group', { name: 'Conversation view' })
  const compact = {
    blocks: screen.queryAllByTestId('work-block').length,
    toolRows: toolRows(),
  }

  fireEvent.click(within(switchGroup).getByRole('button', { name: 'Full' }))
  expect({
    compact,
    full: {
      blocks: screen.queryAllByTestId('work-block').length,
      toolRows: toolRows(),
    },
    remembered: localStorage.getItem(`convergence-transcript-view:${chat.id}`),
  }).toEqual({
    compact: { blocks: 1, toolRows: [] },
    full: { blocks: 0, toolRows: ['r1', 'r2'] },
    remembered: 'full',
  })
})
