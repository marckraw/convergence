import { expect, it, vi } from 'vitest'
import { registerConversationActionsIpcHandlers } from './conversation-actions.ipc'

const { handle } = vi.hoisted(() => ({ handle: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle } }))

it('registers one describe channel and forwards the session id and result', async () => {
  const answer = [
    { id: 'fork', kind: 'routine', label: 'Fork', offered: true },
  ] as const
  const describe = vi.fn().mockResolvedValue(answer)
  registerConversationActionsIpcHandlers({ describe })
  expect(handle).toHaveBeenCalledExactlyOnceWith(
    'conversationActions:describe',
    expect.any(Function),
  )
  expect(await handle.mock.calls[0][1](null, 's')).toBe(answer)
  expect(describe).toHaveBeenCalledExactlyOnceWith('s')
})
