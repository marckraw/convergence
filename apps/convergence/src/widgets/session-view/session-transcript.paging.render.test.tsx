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
const message = (sequence: number): ConversationItem => ({
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
      onLoadOlder={() =>
        void useSessionStore.getState().loadOlderConversation(session.id)
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
