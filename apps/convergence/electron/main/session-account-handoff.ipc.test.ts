import { beforeEach, expect, it, vi } from 'vitest'
import { registerIpcHandlers } from './ipc'
import { HandoffRefusedError } from '../backend/provider/provider-account-handoff.pure'

vi.mock('../backend/pull-request/pull-request-refresh.service', () => ({
  connectPullRequestRefresh: vi.fn(),
}))
const handlers = new Map<string, (...args: unknown[]) => unknown>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
    on: vi.fn(),
  },
  dialog: {},
  BrowserWindow: { getAllWindows: () => [] },
  shell: {},
}))
const sendMessage = vi.fn()
beforeEach(() => {
  handlers.clear()
  sendMessage.mockReset().mockResolvedValue('dispatch-id')
  const args = Array.from({ length: 20 }, () => ({}))
  args[7] = {
    // The person's door since MAR-3288; `sessionApp.sendSessionMessage`
    // calls it, so the handler under test still reaches this stub.
    sendPersonMessage: sendMessage,
    setSummaryUpdateListener: vi.fn(),
    setEvidenceUpdateListener: vi.fn(),
    setConversationPatchListener: vi.fn(),
    setQueuedInputPatchListener: vi.fn(),
    setTurnDeltaListener: vi.fn(),
  }
  registerIpcHandlers(
    ...(args as unknown as Parameters<typeof registerIpcHandlers>),
  )
})

it.each([
  'source-busy',
  'busy',
  'missing-thread',
  'not-eligible',
  'layout',
] as const)(
  'carries a serializable %s refusal through the real send handler',
  async (stage) => {
    sendMessage.mockRejectedValueOnce(
      new HandoffRefusedError(stage, 'Your message was not sent.'),
    )
    const result = await handlers.get('session:sendMessage')!({}, 'session-1', {
      text: 'draft',
      providerAccountId: 'account-b',
    })
    expect(JSON.parse(JSON.stringify(result))).toEqual({
      accepted: false,
      stage,
      message: 'Your message was not sent.',
    })
    expect(sendMessage).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        text: 'draft',
        providerAccountId: 'account-b',
      }),
    )
  },
)

it('returns acceptance only after the service accepts and preserves ordinary errors', async () => {
  const handler = handlers.get('session:sendMessage')!
  await expect(handler({}, 'session-1', { text: 'accepted' })).resolves.toEqual(
    { accepted: true },
  )
  sendMessage.mockRejectedValueOnce(new Error('Unrelated send failure'))
  await expect(handler({}, 'session-1', { text: 'failure' })).rejects.toThrow(
    'Unrelated send failure',
  )
})
