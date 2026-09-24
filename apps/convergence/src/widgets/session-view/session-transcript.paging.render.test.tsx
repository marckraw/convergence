import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { SessionTranscript } from './session-transcript.container'
import {
  useSessionStore,
  type Session,
  type ConversationItem,
  EMPTY_CONVERSATION_PREFIX,
} from '@/entities/session'
import { useTranscriptViewStore } from './transcript-view.model'

const virtual = vi.hoisted(() => ({
  index: vi.fn(),
  offset: vi.fn(),
  size: 160,
  padding: 0,
}))
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: {
    count: number
    getItemKey: (index: number) => string
    scrollPaddingStart: number
  }) => ({
    measurementsCache: Array.from({ length: options.count }, (_, index) => ({
      index,
      start: index * virtual.size,
      end: (index + 1) * virtual.size,
    })),
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        key: options.getItemKey(index),
        start: index * virtual.size,
        end: (index + 1) * virtual.size,
      })),
    getTotalSize: () => options.count * virtual.size,
    getOffsetForIndex: (index: number) => [index * virtual.size],
    measureElement: () => {},
    scrollToIndex: (index: number, optionsForScroll: unknown) => {
      virtual.padding = options.scrollPaddingStart
      virtual.index(index, optionsForScroll)
    },
    scrollToOffset: virtual.offset,
  }),
}))
const session = {
  id: 'paging',
  status: 'running',
  hasActiveHandle: true,
  attention: 'none',
} as Session
let sessionCounter = 0
const handlers = { onApprove: vi.fn(), onDeny: vi.fn(), onInputAnswer: vi.fn() }
const resync = vi.fn().mockResolvedValue(undefined)
let frames: FrameRequestCallback[] = []
const message = (
  sequence: number,
): Extract<ConversationItem, { kind: 'message' }> => ({
  id: `m${sequence}`,
  sessionId: session.id,
  sequence,
  turnId: 't',
  kind: 'message',
  actor: 'assistant',
  text: `text${sequence}`,
  state: 'streaming',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  providerMeta: {
    providerId: 'fake',
    providerItemId: null,
    providerEventType: null,
  },
})
const emit = (
  event: Parameters<
    ReturnType<typeof useSessionStore.getState>['handleConversationPatched']
  >[0],
) => act(() => useSessionStore.getState().handleConversationPatched(event))
function Transcript({ target }: { target?: { id: string; nonce: number } }) {
  const items = useSessionStore((s) => s.activeConversation)
  const window = useSessionStore((s) => s.activeConversationWindow)
  return (
    <SessionTranscript
      session={session}
      conversationItems={items}
      hasOlder={window.hasOlder}
      oldestSequence={window.oldestSequence}
      loadingOlder={window.loading}
      olderError={window.error}
      snapshotVersion={window.snapshotVersion}
      onLoadOlder={(retry) =>
        void useSessionStore.getState().loadOlderConversation(session.id, retry)
      }
      navigationTarget={target}
      {...handlers}
    />
  )
}
async function open() {
  useSessionStore.setState({ activeSessionId: session.id })
  await useSessionStore.getState().loadActiveConversation(session.id)
  const nonce = resync.mock.lastCall![2]
  emit({
    op: 'snapshot',
    sessionId: session.id,
    items: [message(1001), message(1002)],
    prefix: EMPTY_CONVERSATION_PREFIX,
    hasOlder: true,
    oldestSequence: 1001,
    generation: 1,
    pageNonce: nonce,
  })
  return nonce
}
const older = (
  pageNonce: string,
  beforeSequence: number,
  sequences: number[],
  hasOlder = true,
) =>
  emit({
    op: 'older-page',
    sessionId: session.id,
    items: sequences.map(message),
    prefix: EMPTY_CONVERSATION_PREFIX,
    hasOlder,
    oldestSequence: sequences[0],
    generation: 1,
    pageNonce,
    beforeSequence,
  })
beforeEach(() => {
  session.id = `paging-${++sessionCounter}`
  useSessionStore.setState(useSessionStore.getInitialState())
  useTranscriptViewStore.setState({
    modes: { [session.id]: 'full' },
    openBlocks: new Set(),
  })
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { session: { resyncConversation: resync } },
  })
  vi.clearAllMocks()
  frames = []
  virtual.size = 160
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback)
    return frames.length
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames[id - 1] = () => {}
  })
})
it('R2 prepend keeps the first visible item at the same pixel inset while the reply streams', async () => {
  const nonce = await open()
  render(<Transcript />)
  act(() => frames.splice(0).forEach((frame) => frame(0)))
  const region = screen.getByTestId('session-transcript-scroll-region')
  Object.defineProperties(region, {
    scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 100 },
    scrollTop: { configurable: true, writable: true, value: 35 },
  })
  fireEvent.scroll(region)
  expect(resync.mock.lastCall![3]).toEqual({ limit: 300, beforeSequence: 1001 })
  emit({
    op: 'append',
    sessionId: session.id,
    itemId: 'm1002',
    baseLength: 8,
    append: ' live',
    updatedAt: '2026-01-02',
  })
  older(nonce, 1001, [701, 702])
  expect(virtual.index).toHaveBeenLastCalledWith(2, { align: 'start' })
  expect(virtual.padding).toBe(-35)
  expect(screen.getByText('text1002 live')).toBeInTheDocument()
  emit({
    op: 'append',
    sessionId: session.id,
    itemId: 'm1002',
    baseLength: 13,
    append: ' next',
    updatedAt: '2026-01-03',
  })
  expect(screen.getByText('text1002 live next')).toBeInTheDocument()
  expect(resync).toHaveBeenCalledTimes(2)
})
it('R4 a target 1000 items back loads successive pages, retains bottom follow while missing, then lands', async () => {
  const nonce = await open()
  render(<Transcript target={{ id: 'm1', nonce: 1 }} />)
  expect(resync.mock.lastCall![3]).toEqual({ limit: 300, beforeSequence: 1001 })
  older(nonce, 1001, [701])
  act(() => frames.splice(0).forEach((frame) => frame(0)))
  expect(virtual.index).toHaveBeenLastCalledWith(2, { align: 'end' })
  expect(resync.mock.lastCall![3]).toEqual({ limit: 300, beforeSequence: 701 })
  older(nonce, 701, [401])
  older(nonce, 401, [101])
  older(nonce, 101, [1], false)
  act(() => frames.splice(0).forEach((frame) => frame(0)))
  expect(virtual.index).toHaveBeenLastCalledWith(0, { align: 'center' })
  expect(resync).toHaveBeenCalledTimes(5)
})
it('R4 a pinned old approval is visible and answerable', async () => {
  await open()
  const approval = {
    ...message(1),
    kind: 'approval-request',
    description: 'Old permission',
    resolution: 'pending',
    providerMeta: {
      providerId: 'fake',
      providerItemId: 'approval-1',
      providerEventType: null,
    },
  } as ConversationItem
  useSessionStore.setState((state) => ({
    activeConversation: [approval, ...state.activeConversation],
  }))
  render(<Transcript />)
  fireEvent.click(screen.getByRole('button', { name: /Allow once|Approve/ }))
  expect(handlers.onApprove).toHaveBeenCalledWith(session.id, 'approval-1')
})

it('R2 Compact keeps an unfolded member anchored when prepending extends and rekeys its work block', async () => {
  const nonce = await open()
  virtual.size = 20
  const tool = (sequence: number) =>
    ({
      ...message(sequence),
      kind: 'tool-call',
      toolName: 'Read',
      inputText: '{}',
    }) as ConversationItem
  useSessionStore.setState({ activeConversation: [tool(1001), tool(1002)] })
  useTranscriptViewStore.setState({
    modes: { [session.id]: 'compact' },
    openBlocks: new Set(['m1001']),
  })
  render(<Transcript />)
  act(() => frames.splice(0).forEach((frame) => frame(0)))
  const region = screen.getByTestId('session-transcript-scroll-region')
  Object.defineProperties(region, {
    scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 100 },
    scrollTop: { configurable: true, writable: true, value: 35 },
  })
  fireEvent.scroll(region)
  emit({
    op: 'older-page',
    sessionId: session.id,
    items: [tool(701), tool(702)],
    prefix: EMPTY_CONVERSATION_PREFIX,
    hasOlder: true,
    oldestSequence: 701,
    generation: 1,
    pageNonce: nonce,
    beforeSequence: 1001,
  })
  expect(useTranscriptViewStore.getState().openBlocks.has('m701')).toBe(true)
  expect(virtual.index).toHaveBeenLastCalledWith(3, { align: 'start' })
  expect(virtual.padding).toBe(-15)
  expect(
    document.querySelector('[data-conversation-item-id="m1001"]'),
  ).not.toBeNull()
})

it('R9 button loads exactly one page; failure shows Try again and clears the failed episode', async () => {
  const nonce = await open()
  render(<Transcript />)
  act(() => frames.splice(0).forEach((frame) => frame(0)))
  const region = screen.getByTestId('session-transcript-scroll-region')
  Object.defineProperties(region, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: 100 },
    scrollTop: { writable: true, value: 35 },
  })
  resync.mockRejectedValueOnce(new Error('Database busy'))
  await act(async () =>
    fireEvent.click(
      screen.getByRole('button', { name: 'Load earlier messages' }),
    ),
  )
  expect(resync).toHaveBeenCalledTimes(2)
  expect(screen.getByText('Database busy')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(resync).toHaveBeenCalledTimes(3)
  expect(screen.getByText('Loading earlier messages…')).toBeInTheDocument()
  older(nonce, 1001, [701])
  expect(virtual.index).toHaveBeenLastCalledWith(1, { align: 'start' })
  expect(virtual.padding).toBe(-35)
  expect(
    screen.getByRole('button', { name: 'Load earlier messages' }),
  ).toBeInTheDocument()
  expect(resync).toHaveBeenCalledTimes(3)
})

it.each([false, true])(
  'R9 Compact auto-fills 300 folded tools in a 400px viewport until overflow=%s or five pages',
  async (overflow) => {
    const nonce = await open()
    const tool = (sequence: number) =>
      ({
        ...message(sequence),
        kind: 'tool-call',
        toolName: 'Read',
        inputText: '{}',
      }) as ConversationItem
    useSessionStore.setState({
      activeConversation: Array.from({ length: 300 }, (_, i) => tool(1001 + i)),
    })
    useTranscriptViewStore.setState({
      modes: { [session.id]: 'compact' },
      openBlocks: new Set(),
    })
    virtual.size = 82
    const height = vi
      .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
      .mockReturnValue(400)
    const scrollHeight = vi
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return (
          Number.parseFloat(
            this.querySelector<HTMLElement>('.relative.w-full')?.style.height ??
              '0',
          ) + 56
        )
      })
    try {
      render(<Transcript />)
      expect(resync).toHaveBeenCalledTimes(2)
      for (let page = 0; page < (overflow ? 1 : 5); page++) {
        const beforeSequence = 1001 - page * 100
        emit({
          op: 'older-page',
          sessionId: session.id,
          generation: 1,
          pageNonce: nonce,
          beforeSequence,
          oldestSequence: beforeSequence - 100,
          hasOlder: true,
          prefix: EMPTY_CONVERSATION_PREFIX,
          items: overflow
            ? Array.from({ length: 10 }, (_, i) => ({
                ...message(beforeSequence - 100 + i),
                actor: 'user' as const,
              }))
            : Array.from({ length: 100 }, (_, i) =>
                tool(beforeSequence - 100 + i),
              ),
        })
      }
      expect(resync).toHaveBeenCalledTimes(overflow ? 2 : 6)
      expect(
        screen.getByRole('button', { name: 'Load earlier messages' }),
      ).toBeInTheDocument()
      fireEvent.click(
        screen.getByRole('button', { name: 'Load earlier messages' }),
      )
      expect(resync).toHaveBeenCalledTimes(overflow ? 3 : 7)
    } finally {
      height.mockRestore()
      scrollHeight.mockRestore()
    }
  },
)

it('R11 a loaded hidden target is dropped immediately and its nonce is marked', async () => {
  await open()
  const hidden = { ...message(1), agentRunId: 'child' }
  const rows = [
    {
      id: 'parent',
      parentId: null,
      kind: 'agent',
      run: { id: 'parent', spawnedByItemId: 'm2' },
    },
    {
      id: 'child',
      parentId: 'parent',
      kind: 'agent',
      run: { id: 'child', spawnedByItemId: 'm1', parentRunId: 'parent' },
    },
  ] as unknown as NonNullable<
    Parameters<typeof SessionTranscript>[0]['parallelRows']
  >
  const load = vi.fn()
  const props = {
    session,
    ...handlers,
    hasOlder: true,
    oldestSequence: 1001,
    onLoadOlder: load,
    navigationTarget: { id: 'm1', nonce: 1 },
    parallelRows: rows,
  }
  const { rerender } = render(
    <SessionTranscript
      {...props}
      conversationItems={[hidden, message(1001)]}
    />,
  )
  expect(load).not.toHaveBeenCalled()
  rerender(<SessionTranscript {...props} conversationItems={[message(1001)]} />)
  expect(load).not.toHaveBeenCalled()
})

it('R11 a failed older load drops a pending jump even after retry succeeds', async () => {
  const nonce = await open()
  resync.mockRejectedValueOnce(new Error('Read failed'))
  await act(async () => render(<Transcript target={{ id: 'm1', nonce: 9 }} />))
  expect(resync).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  older(nonce, 1001, [701])
  expect(resync).toHaveBeenCalledTimes(3)
})

it.each(['snapshot', 'failure', 'dropped'] as const)(
  'R12 clears a prepend anchor on %s before a later window change',
  async (reason) => {
    await open()
    const load = vi.fn()
    const props = {
      session,
      ...handlers,
      hasOlder: true,
      oldestSequence: 1001,
      snapshotVersion: 1,
      onLoadOlder: load,
    }
    const current = [message(1001), message(1002)]
    const { rerender } = render(
      <SessionTranscript {...props} conversationItems={current} />,
    )
    act(() => frames.splice(0).forEach((frame) => frame(0)))
    const region = screen.getByTestId('session-transcript-scroll-region')
    Object.defineProperties(region, {
      scrollHeight: { value: 1000 },
      clientHeight: { value: 100 },
      scrollTop: { writable: true, value: 35 },
    })
    fireEvent.scroll(region)
    rerender(
      <SessionTranscript {...props} loadingOlder conversationItems={current} />,
    )
    const extra =
      reason === 'snapshot'
        ? { snapshotVersion: 2, oldestSequence: 701 }
        : reason === 'failure'
          ? { olderError: 'Failed' }
          : {}
    virtual.index.mockClear()
    rerender(
      <SessionTranscript
        {...props}
        {...extra}
        conversationItems={
          reason === 'snapshot' ? [message(701), ...current] : current
        }
      />,
    )
    expect(virtual.index).not.toHaveBeenCalled()
    rerender(
      <SessionTranscript
        {...props}
        snapshotVersion={reason === 'snapshot' ? 2 : 1}
        oldestSequence={701}
        conversationItems={[message(701), ...current]}
      />,
    )
    expect(virtual.index).not.toHaveBeenCalled()
  },
)
