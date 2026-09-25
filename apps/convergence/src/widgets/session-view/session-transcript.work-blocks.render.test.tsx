import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationItem, Session } from '@/entities/session'
import { SessionTranscript } from './session-transcript.container'
import { ConversationViewMenu } from './conversation-view-menu.container'
import { useTranscriptViewStore } from './transcript-view.model'

const scrollToIndex = vi.fn()
// Rows re-measure after they land; a test grows the total to say so.
let mockMeasuredGrowth = 0

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
    getTotalSize: () => options.count * 160 + mockMeasuredGrowth,
    measureElement: () => {},
    scrollToIndex,
  }),
}))

const session: Session = {
  id: 'cv1-session',
  contextKind: 'project',
  projectId: 'p',
  workspaceId: 'w',
  providerId: 'claude-code',
  model: 'sonnet',
  effort: 'medium',
  name: 'CV1',
  status: 'running',
  hasActiveHandle: true,
  attention: 'none',
  activity: null,
  workingDirectory: '/repo',
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

let sequence = 0
function base(id: string) {
  sequence += 1
  return {
    id,
    sessionId: session.id,
    sequence,
    turnId: 'turn-1',
    state: 'complete' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: null,
    },
  }
}
const user = (id: string): ConversationItem => ({
  ...base(id),
  kind: 'message',
  actor: 'user',
  text: `user says ${id}`,
})
const agent = (id: string): ConversationItem => ({
  ...base(id),
  kind: 'message',
  actor: 'assistant',
  text: `agent says ${id}`,
})
const read = (id: string): ConversationItem => ({
  ...base(id),
  kind: 'tool-call',
  toolName: 'Read',
  inputText: JSON.stringify({ file_path: `/repo/src/app/${id}.ts` }, null, 2),
})
const answer = (id: string, of: string): ConversationItem => ({
  ...base(id),
  kind: 'tool-result',
  toolName: 'Read',
  relatedItemId: of,
  outputText: `contents of ${of}`,
})

const handlers = {
  onApprove: vi.fn(),
  onDeny: vi.fn(),
  onInputAnswer: vi.fn(),
}

function renderTranscript(
  items: ConversationItem[],
  extra: Partial<Parameters<typeof SessionTranscript>[0]> = {},
) {
  return render(
    <SessionTranscript
      session={session}
      conversationItems={items}
      {...handlers}
      {...extra}
    />,
  )
}

const blocks = () => screen.queryAllByTestId('work-block')
const itemRow = (id: string) =>
  document.querySelector(`[data-conversation-item-id="${id}"]`)

beforeEach(() => {
  localStorage.clear()
  useTranscriptViewStore.setState({ modes: {}, openBlocks: new Set() })
  scrollToIndex.mockClear()
  mockMeasuredGrowth = 0
})

const turn = [
  user('u1'),
  read('r1'),
  answer('a1', 'r1'),
  read('r2'),
  answer('a2', 'r2'),
  agent('m1'),
]

describe('MAR-3391 CV1 work blocks in the transcript', () => {
  it('R5 a new conversation renders Compact — mutation default to Full turns red', () => {
    renderTranscript(turn)
    expect({
      blocks: blocks().map((block) => block.textContent),
      toolRows: ['r1', 'a1', 'r2', 'a2'].filter((id) => itemRow(id)),
      spoken: [itemRow('u1') !== null, itemRow('m1') !== null],
    }).toEqual({
      blocks: ['Read 2 files in src/app'],
      toolRows: [],
      spoken: [true, true],
    })
  })

  it('R5 Full draws every entry as today, and the choice is remembered per conversation', () => {
    render(
      <ConversationViewMenu
        sessionId={session.id}
        open
        onOpenChange={() => {}}
        onOpenParallelWork={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Full' }))
    renderTranscript(turn)
    const fullRows = screen
      .getAllByTestId('session-transcript-row')
      .map((row) => row.getAttribute('data-conversation-item-id'))

    // A fresh window reads storage again: this conversation stays Full,
    // another one opens Compact.
    useTranscriptViewStore.setState({ modes: {} })
    expect({
      fullRows,
      blocks: blocks().length,
      stored: useTranscriptViewStore.getState().modes,
      thisOne: localStorage.getItem(
        `convergence-transcript-view:${session.id}`,
      ),
      other: localStorage.getItem('convergence-transcript-view:other'),
    }).toEqual({
      fullRows: ['u1', 'r1', 'a1', 'r2', 'a2', 'm1'],
      blocks: 0,
      stored: {},
      thisOne: 'full',
      other: null,
    })
  })

  it('R3 open stays open across an unmount — mutation keep open state in the row turns red', () => {
    const first = renderTranscript(turn)
    fireEvent.click(blocks()[0]!)
    const openedRows = ['r1', 'a1', 'r2', 'a2'].every((id) => itemRow(id))
    first.unmount()

    renderTranscript(turn)
    expect({
      openedRows,
      expanded: blocks()[0]!.getAttribute('aria-expanded'),
      remounted: ['r1', 'a1', 'r2', 'a2'].every((id) => itemRow(id)),
    }).toEqual({ openedRows: true, expanded: 'true', remounted: true })

    fireEvent.click(blocks()[0]!)
    expect(itemRow('r1')).toBeNull()
  })

  it('R4 the open block grows live and closes when the agent speaks — mutation never clear Working turns red', () => {
    const feed = [user('u1'), read('r1'), answer('a1', 'r1'), read('r2')]
    const { rerender } = renderTranscript(feed.slice(0, 2))
    const labels: string[] = []
    for (let count = 2; count <= feed.length; count += 1) {
      rerender(
        <SessionTranscript
          session={session}
          conversationItems={feed.slice(0, count)}
          {...handlers}
        />,
      )
      labels.push(blocks().at(-1)!.textContent ?? '')
    }
    rerender(
      <SessionTranscript
        session={session}
        conversationItems={[...feed, agent('m1')]}
        {...handlers}
      />,
    )
    expect({
      labels,
      closed: blocks().map((block) => block.textContent),
      working: blocks().map((block) => block.dataset.working ?? null),
    }).toEqual({
      labels: [
        'Working… read 1 file',
        'Working… read 1 file',
        'Working… read 2 files in src/app',
      ],
      closed: ['Read 2 files in src/app'],
      working: [null],
    })
  })

  it('R4 a finished conversation has no working block', () => {
    renderTranscript([user('u1'), read('r1')], {
      session: { ...session, status: 'completed' },
    })
    expect(blocks().map((block) => block.textContent)).toEqual(['Read 1 file'])
  })

  it('R6 a jump to a folded item opens its block and lands on the item — mutation jump without opening turns red', () => {
    renderTranscript(turn, { navigationTarget: { id: 'a2', nonce: 1 } })
    const rows = screen
      .getAllByTestId('session-transcript-row')
      .map(
        (row) =>
          row.getAttribute('data-conversation-item-id') ??
          `block:${row.getAttribute('data-work-block-id')}`,
      )
    expect({
      expanded: blocks()[0]!.getAttribute('aria-expanded'),
      landed: scrollToIndex.mock.calls.find(
        ([, options]) => options?.align === 'center',
      ),
      rows,
    }).toEqual({
      expanded: 'true',
      landed: [rows.indexOf('a2'), { align: 'center' }],
      rows: ['u1', 'block:r1', 'r1', 'a1', 'r2', 'a2', 'm1'],
    })
  })

  it('R6 D1 a jump from the bottom into a folded block ends on the item, not the bottom — mutation keep bottom-follow turns red', () => {
    const frames = new Map<number, FrameRequestCallback>()
    let nextFrame = 0
    const request = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        nextFrame += 1
        frames.set(nextFrame, callback)
        return nextFrame
      })
    const cancel = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation((id) => {
        frames.delete(id)
      })
    const flushFrames = () =>
      act(() => {
        const queued = [...frames.values()]
        frames.clear()
        for (const callback of queued) callback(0)
      })
    try {
      const items = [user('u1'), read('r1'), answer('a1', 'r1'), agent('m1')]
      const { rerender } = renderTranscript(items)
      flushFrames()
      // Sitting at the bottom: the last scroll followed the latest row.
      const atBottom = scrollToIndex.mock.calls.at(-1)
      scrollToIndex.mockClear()

      rerender(
        <SessionTranscript
          session={session}
          conversationItems={items}
          navigationTarget={{ id: 'a1', nonce: 1 }}
          {...handlers}
        />,
      )
      flushFrames()
      // The opened rows measure taller after the jump lands; the transcript
      // must not treat that as new content to follow to the bottom.
      mockMeasuredGrowth = 240
      rerender(
        <SessionTranscript
          session={session}
          conversationItems={items}
          navigationTarget={{ id: 'a1', nonce: 1 }}
          {...handlers}
        />,
      )
      flushFrames()
      const rows = screen
        .getAllByTestId('session-transcript-row')
        .map(
          (row) =>
            row.getAttribute('data-conversation-item-id') ??
            `block:${row.getAttribute('data-work-block-id')}`,
        )
      expect({
        atBottom,
        rows,
        last: scrollToIndex.mock.calls.at(-1),
        calls: scrollToIndex.mock.calls,
      }).toEqual({
        atBottom: [2, { align: 'end' }],
        rows: ['u1', 'block:r1', 'r1', 'a1', 'm1'],
        last: [3, { align: 'center' }],
        calls: [[3, { align: 'center' }]],
      })
    } finally {
      request.mockRestore()
      cancel.mockRestore()
    }
  })

  it('R1 approvals are never folded and stay answerable without opening anything', () => {
    const approval: ConversationItem = {
      ...base('ap'),
      kind: 'approval-request',
      resolution: 'pending',
      description: 'Allow Bash?',
      providerMeta: {
        providerId: 'claude-code',
        providerItemId: 'perm-1',
        providerEventType: null,
      },
    }
    renderTranscript([user('u1'), read('r1'), approval, read('r2')])
    const allow =
      screen.queryByRole('button', { name: 'Allow once' }) ??
      screen.getByRole('button', { name: 'Approve' })
    act(() => fireEvent.click(allow))
    expect({
      blocks: blocks().length,
      approved: handlers.onApprove.mock.calls.at(-1),
    }).toEqual({ blocks: 2, approved: [session.id, 'perm-1'] })
  })
})
