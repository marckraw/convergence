import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useSessionStore,
  type ConversationItem,
  type Session,
} from '@/entities/session'
import { SessionTranscript } from './session-transcript.container'
import { buildTranscriptEntryViewModel } from './transcript-entry.pure'
import { useTranscriptViewStore } from './transcript-view.model'

// MAR-3310 F1e: what one streaming append costs the transcript.

const virtual = vi.hoisted(() => ({
  window: 50,
  growth: 0,
  bump: null as null | (() => void),
  getItemKeys: [] as unknown[],
  scrollToIndex: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
}))

// The real virtualizer redraws its host when a row measures taller; `bump`
// is that redraw. Only the last `window` rows are drawn, as on screen.
vi.mock('@tanstack/react-virtual', async () => {
  const { useReducer } = await import('react')
  const { vi } = await import('vitest')
  virtual.scrollToIndex = vi.fn()
  return {
    useVirtualizer: (options: {
      count: number
      getItemKey?: (index: number) => string | number | bigint
    }) => {
      const [, redraw] = useReducer((n: number) => n + 1, 0)
      virtual.bump = redraw
      virtual.getItemKeys.push(options.getItemKey)
      const first = Math.max(0, options.count - virtual.window)
      return {
        getVirtualItems: () =>
          Array.from({ length: options.count - first }, (_, offset) => ({
            index: first + offset,
            key: options.getItemKey?.(first + offset) ?? first + offset,
            start: (first + offset) * 160,
          })),
        getTotalSize: () => options.count * 160 + virtual.growth,
        measureElement: () => {},
        scrollToIndex: virtual.scrollToIndex,
      }
    },
  }
})

vi.mock('./transcript-entry.pure', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./transcript-entry.pure')>()
  return {
    ...actual,
    buildTranscriptEntryViewModel: vi.fn(actual.buildTranscriptEntryViewModel),
  }
})

let sessionCounter = 0
let session: Session

function makeSession(id: string): Session {
  return {
    id,
    contextKind: 'project',
    projectId: 'p',
    workspaceId: 'w',
    providerId: 'claude-code',
    model: 'sonnet',
    effort: 'medium',
    name: 'F1e',
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
}

function message(
  index: number,
  text: string,
  state: 'streaming' | 'complete' = 'complete',
): ConversationItem {
  return {
    id: `${session.id}-m${index}`,
    sessionId: session.id,
    sequence: index + 1,
    turnId: 'turn-1',
    kind: 'message',
    actor: index % 2 === 0 ? 'user' : 'assistant',
    state,
    text,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: null,
    },
  }
}

function approval(index: number): ConversationItem {
  return {
    id: `${session.id}-approval${index}`,
    sessionId: session.id,
    sequence: index + 1,
    turnId: 'turn-1',
    kind: 'approval-request',
    state: 'complete',
    description: 'Run the build?',
    resolution: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: 'provider-approval',
      providerEventType: null,
    },
  }
}

const handlers = {
  onApprove: vi.fn(),
  onDeny: vi.fn(),
  onInputAnswer: vi.fn(),
}

function StoreTranscript({
  navigationTarget = null,
}: {
  navigationTarget?: { id: string; nonce: number } | null
}) {
  const items = useSessionStore((state) => state.activeConversation)
  return (
    <SessionTranscript
      session={session}
      conversationItems={items}
      navigationTarget={navigationTarget}
      {...handlers}
    />
  )
}

function open(items: ConversationItem[]) {
  useSessionStore.setState({
    activeSessionId: session.id,
    activeConversationSessionId: session.id,
    activeConversation: items,
  })
}

function append(itemId: string, baseLength: number, text: string) {
  useSessionStore.getState().handleConversationPatched({
    op: 'append',
    sessionId: session.id,
    itemId,
    baseLength,
    append: text,
    updatedAt: '2026-01-01T00:00:01.000Z',
  })
}

const rowText = (id: string) =>
  document.querySelector(`[data-conversation-item-id="${id}"]`)?.textContent ??
  ''

function rowRenders(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const [input] of vi.mocked(buildTranscriptEntryViewModel).mock.calls) {
    counts[input.item.id] = (counts[input.item.id] ?? 0) + 1
  }
  return counts
}

beforeEach(() => {
  sessionCounter += 1
  session = makeSession(`f1e-session-${sessionCounter}`)
  localStorage.clear()
  useTranscriptViewStore.setState({ modes: {}, openBlocks: new Set() })
  useSessionStore.setState(useSessionStore.getInitialState())
  virtual.window = 50
  virtual.growth = 0
  virtual.getItemKeys = []
  virtual.scrollToIndex.mockClear()
  vi.mocked(buildTranscriptEntryViewModel).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MAR-3310 F1e a growing reply redraws its own row', () => {
  it('R1 200 appends to the last of 1,000 items keep the list; the row shows the full text; completion changes the list once — mutation route appends through upsertConversationItem turns red', () => {
    const items = Array.from({ length: 1000 }, (_, index) =>
      message(index, `said ${index}`, index === 999 ? 'streaming' : 'complete'),
    )
    const streamingId = items[999]!.id
    open(items)
    render(<StoreTranscript />)

    let listChanges = 0
    let previous = useSessionStore.getState().activeConversation
    const unsubscribe = useSessionStore.subscribe((state) => {
      if (state.activeConversation === previous) return
      listChanges += 1
      previous = state.activeConversation
    })
    let text = 'said 999'
    for (let index = 0; index < 200; index += 1) {
      const words = ` word${index}`
      act(() => append(streamingId, text.length, words))
      text += words
    }
    const duringAppends = listChanges
    const shownWhileStreaming = rowText(streamingId).includes(text)

    act(() =>
      useSessionStore.getState().handleConversationPatched({
        op: 'patch',
        sessionId: session.id,
        item: { ...message(999, text), updatedAt: '2026-01-01T00:00:02.000Z' },
      }),
    )
    unsubscribe()

    expect({
      duringAppends,
      shownWhileStreaming,
      afterComplete: listChanges,
      shownAfterComplete: rowText(streamingId).includes(text),
    }).toEqual({
      duringAppends: 0,
      shownWhileStreaming: true,
      afterComplete: 1,
      shownAfterComplete: true,
    })
  })

  it('R3 with 50 rows drawn, one append redraws exactly that row, even when the transcript redraws around it — mutations remove the row memo or make approval handlers per render turn red', () => {
    const items = [
      ...Array.from({ length: 48 }, (_, index) =>
        message(index, `said ${index}`),
      ),
      approval(48),
      message(49, 'growing', 'streaming'),
    ]
    const streamingId = items[49]!.id
    open(items)
    render(<StoreTranscript />)
    expect(
      document.querySelectorAll('[data-testid="session-transcript-row"]'),
    ).toHaveLength(50)
    // The approval is live, so it carries handlers a redraw must not remake.
    expect(document.body.textContent).toContain('Approve')
    vi.mocked(buildTranscriptEntryViewModel).mockClear()

    act(() => append(streamingId, 'growing'.length, ' more'))
    // The row measured taller: the virtualizer redraws the transcript.
    act(() => virtual.bump?.())

    expect(rowRenders()).toEqual({ [streamingId]: 1 })
    expect(rowText(streamingId)).toContain('growing more')
  })

  it('R2 getItemKey keeps its identity across a redraw of the same rows — mutation inline getItemKey turns red', () => {
    open([message(0, 'hello'), message(1, 'growing', 'streaming')])
    render(<StoreTranscript />)
    const before = virtual.getItemKeys.at(-1)
    act(() => virtual.bump?.())
    expect(virtual.getItemKeys.length).toBeGreaterThan(1)
    expect(virtual.getItemKeys.at(-1)).toBe(before)
  })

  it('R7 at the bottom, a jump to an unknown id leaves bottom-follow on: five appends still follow the reply — mutation release the scroll above the lookup turns red', () => {
    const frames = new Map<number, FrameRequestCallback>()
    let nextFrame = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      nextFrame += 1
      frames.set(nextFrame, callback)
      return nextFrame
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id)
    })
    const flushFrames = () =>
      act(() => {
        const queued = [...frames.values()]
        frames.clear()
        for (const callback of queued) callback(0)
      })

    const items = [message(0, 'question'), message(1, 'answer', 'streaming')]
    const streamingId = items[1]!.id
    open(items)
    const { rerender } = render(<StoreTranscript />)
    flushFrames()
    const atBottom = virtual.scrollToIndex.mock.calls.at(-1)

    rerender(<StoreTranscript navigationTarget={{ id: 'nowhere', nonce: 1 }} />)
    flushFrames()
    virtual.scrollToIndex.mockClear()

    let text = 'answer'
    for (let index = 0; index < 5; index += 1) {
      const words = ` more${index}`
      act(() => append(streamingId, text.length, words))
      text += words
      // Each append makes the row taller; the virtualizer redraws.
      virtual.growth += 24
      act(() => virtual.bump?.())
      flushFrames()
    }

    expect({
      atBottom,
      follows: virtual.scrollToIndex.mock.calls,
    }).toEqual({
      atBottom: [1, { align: 'end' }],
      follows: Array.from({ length: 5 }, () => [1, { align: 'end' }]),
    })
  })
})
