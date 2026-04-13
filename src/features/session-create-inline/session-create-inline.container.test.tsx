import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/entities/session'
import { SessionCreateInline } from './session-create-inline.container'

describe('SessionCreateInline', () => {
  const beginSessionDraft = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useSessionStore.setState({
      sessions: [],
      activeSessionId: 'session-1',
      draftWorkspaceId: null,
      providers: [],
      error: null,
      loadSessions: vi.fn(),
      loadProviders: vi.fn(),
      createAndStartSession: vi.fn(),
      approveSession: vi.fn(),
      denySession: vi.fn(),
      sendMessageToSession: vi.fn(),
      stopSession: vi.fn(),
      deleteSession: vi.fn(),
      beginSessionDraft,
      setActiveSession: vi.fn(),
      handleSessionUpdate: vi.fn(),
      clearError: vi.fn(),
    })
  })

  it('opens a main-area draft for the chosen workspace', () => {
    render(<SessionCreateInline workspaceId="workspace-1" />)

    fireEvent.click(screen.getByRole('button', { name: /new session/i }))

    expect(beginSessionDraft).toHaveBeenCalledWith('workspace-1')
  })
})
