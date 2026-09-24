import { afterEach, expect, it, vi } from 'vitest'
import { conversationActionsApi } from './conversation-actions.api'
import type { ConversationRoutineAction } from './conversation-actions.types'

afterEach(() => vi.unstubAllGlobals())

it('asks the IPC door once for the named conversation and preserves its answer', async () => {
  const answer: ConversationRoutineAction[] = [
    {
      id: 'compact',
      kind: 'routine',
      label: 'Compact',
      offered: false,
      reason: 'Provider request pending',
    },
  ]
  const describe = vi.fn().mockResolvedValue(answer)
  vi.stubGlobal('electronAPI', { conversationActions: { describe } })
  expect(await conversationActionsApi.describe('session-1')).toBe(answer)
  expect(describe).toHaveBeenCalledExactlyOnceWith('session-1')
})

it('preserves IPC failures instead of manufacturing an empty list', async () => {
  vi.stubGlobal('electronAPI', {
    conversationActions: {
      describe: vi.fn().mockRejectedValue(new Error('Session not found: gone')),
    },
  })
  await expect(conversationActionsApi.describe('gone')).rejects.toThrow(
    'Session not found: gone',
  )
})
