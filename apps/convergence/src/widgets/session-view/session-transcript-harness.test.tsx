import { render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { Session, ConversationItem } from '@/entities/session'
import { SessionTranscript } from './session-transcript.container'
const virtualizer = vi.hoisted(() => ({
  getVirtualItems: () => [],
  getTotalSize: () => 0,
  measureElement: vi.fn(),
  scrollToIndex: vi.fn(),
}))
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => virtualizer,
}))
it('small scroll follows length or last sequence, not refetch identity — mutation depend on compactions array turns red', () => {
  const frame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  const session = {
    id: 's',
    status: 'completed',
    attention: 'finished',
  } as Session
  const items = [
    {
      id: 'm',
      sessionId: 's',
      kind: 'message',
      actor: 'assistant',
      text: 'text',
      createdAt: '2026-01-01T00:00:00Z',
      sequence: 1,
    },
  ] as ConversationItem[]
  const fact = {
    kind: 'harness.compaction' as const,
    at: '2026-01-01T00:00:01Z',
    sequence: 1,
    trigger: 'auto',
    preTokens: 100,
    postTokens: 10,
    durationMs: null,
  }
  const props = {
    session,
    conversationItems: items,
    onApprove: vi.fn(),
    onDeny: vi.fn(),
    onInputAnswer: vi.fn(),
  }
  const { rerender, unmount } = render(
    <SessionTranscript {...props} compactions={[fact]} />,
  )
  frame.mockClear()
  rerender(<SessionTranscript {...props} compactions={[{ ...fact }]} />)
  const unchanged = frame.mock.calls.length
  rerender(
    <SessionTranscript
      {...props}
      compactions={[fact, { ...fact, sequence: 2 }]}
    />,
  )
  const added = frame.mock.calls.length
  rerender(
    <SessionTranscript
      {...props}
      compactions={[fact, { ...fact, sequence: 3 }]}
    />,
  )
  const lastChanged = frame.mock.calls.length
  unmount()
  frame.mockRestore()
  expect({ unchanged, added, lastChanged }).toEqual({
    unchanged: 0,
    added: 1,
    lastChanged: 2,
  })
})
