import { EMPTY_CONVERSATION_PREFIX } from '../../src/entities/session/conversation-prefix.pure'
import { beforeEach, expect, it, vi } from 'vitest'
import type {
  ConversationItem,
  ConversationPatchEvent,
} from '../backend/session/conversation-item.types'
import type { SessionSummary } from '../backend/session/session.types'
import { registerIpcHandlers } from './ipc'

vi.mock('../backend/pull-request/pull-request-refresh.service', () => ({
  connectPullRequestRefresh: vi.fn(),
}))
const handlers = new Map<string, (...args: unknown[]) => unknown>()
const send = vi.fn()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
    on: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
  },
  dialog: {},
  shell: {},
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send } }],
  },
}))
let emitPatch: (event: ConversationPatchEvent) => void
let emitSummary: (summary: SessionSummary) => void
const getConversation = vi.fn()
const getConversationPage = vi.fn()
const item: Extract<ConversationItem, { kind: 'message' }> = {
  id: 'item',
  sessionId: 'session',
  sequence: 1,
  turnId: null,
  kind: 'message',
  state: 'streaming',
  actor: 'assistant',
  text: 'one',
  createdAt: 'same',
  updatedAt: 'same',
  providerMeta: {
    providerId: 'fake',
    providerItemId: null,
    providerEventType: null,
  },
}
function patch(text: string) {
  emitPatch({ op: 'patch', sessionId: 'session', item: { ...item, text } })
}
beforeEach(() => {
  vi.resetAllMocks()
  handlers.clear()
  const args = Array.from({ length: 20 }, () => ({}))
  args[7] = {
    getConversation,
    getConversationPage,
    setSummaryUpdateListener: (listener: typeof emitSummary) => {
      emitSummary = listener
    },
    setConversationPatchListener: (listener: typeof emitPatch) => {
      emitPatch = listener
    },
    setEvidenceUpdateListener: vi.fn(),
    setQueuedInputPatchListener: vi.fn(),
    setTurnDeltaListener: vi.fn(),
  }
  registerIpcHandlers(
    ...(args as unknown as Parameters<typeof registerIpcHandlers>),
  )
})

it('R2b/R2e flushes before exactly one snapshot and sends all three in order on the patch channel', () => {
  patch('one')
  send.mockClear()
  getConversationPage.mockImplementation(() => {
    patch('one two') // generated pending patch flushed by the existing service contract
    return {
      items: [{ ...item, text: 'one two' }],
      prefix: EMPTY_CONVERSATION_PREFIX,
      hasOlder: false,
      oldestSequence: 1,
    }
  })
  const acknowledgment = handlers.get('session:resyncConversation')!(
    { sender: { send } },
    'session',
    2,
    'page',
  )
  patch('one two three')
  expect(acknowledgment).toBeUndefined()
  expect(getConversation).not.toHaveBeenCalled()
  expect(getConversationPage).toHaveBeenCalledExactlyOnceWith('session', {
    limit: 300,
  })
  expect(
    send.mock.calls.filter(([, event]) => event.op === 'snapshot'),
  ).toHaveLength(1)
  expect(send.mock.calls).toEqual([
    [
      'session:conversationPatched',
      {
        op: 'append',
        sessionId: 'session',
        itemId: 'item',
        baseLength: 3,
        append: ' two',
        updatedAt: 'same',
      },
    ],
    [
      'session:conversationPatched',
      {
        op: 'snapshot',
        beforeSequence: undefined,
        prefix: EMPTY_CONVERSATION_PREFIX,
        hasOlder: false,
        oldestSequence: 1,
        sessionId: 'session',
        items: [{ ...item, text: 'one two' }],
        generation: 2,
        pageNonce: 'page',
      },
    ],
    [
      'session:conversationPatched',
      {
        op: 'append',
        sessionId: 'session',
        itemId: 'item',
        baseLength: 7,
        append: ' three',
        updatedAt: 'same',
      },
    ],
  ])
})

it.each([
  [undefined, 1, 'page'],
  ['', 1, 'page'],
  ['session', 0, 'page'],
  ['session', 1.5, 'page'],
  ['session', 1, undefined],
  ['session', 1, ''],
])(
  'R2d rejects invalid snapshot arguments (%s, %s, %s)',
  (id, generation, pageNonce) => {
    expect(() =>
      handlers.get('session:resyncConversation')!(
        { sender: { send } },
        id,
        generation,
        pageNonce,
      ),
    ).toThrow('Invalid conversation snapshot request')
    expect(getConversation).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  },
)

it.each(['idle', 'answered', 'completed', 'failed'] as const)(
  'R3 forgets streaming memory when a session becomes %s',
  (status) => {
    patch('one')
    patch('one two')
    expect(send.mock.lastCall?.[1].op).toBe('append')
    emitSummary({ id: 'session', status } as SessionSummary)
    patch('one two three')
    expect(send.mock.lastCall?.[1].op).toBe('patch')
  },
)
