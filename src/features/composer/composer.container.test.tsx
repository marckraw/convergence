import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ComposerContainer } from './composer.container'
import { useSessionStore } from '@/entities/session'

describe('ComposerContainer', () => {
  beforeEach(() => {
    const loadProviders = vi.fn()
    const createAndStartSession = vi.fn()
    const sendMessageToSession = vi.fn()

    useSessionStore.setState({
      sessions: [
        {
          id: 'session-1',
          projectId: 'project-1',
          workspaceId: null,
          providerId: 'claude-code',
          model: 'claude-sonnet',
          effort: 'medium',
          name: 'Failed session',
          status: 'failed',
          attention: 'failed',
          workingDirectory: '/tmp/project-1',
          transcript: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      providers: [
        {
          id: 'claude-code',
          name: 'Claude Code',
          vendorLabel: 'Anthropic',
          supportsContinuation: true,
          defaultModelId: 'claude-sonnet',
          modelOptions: [
            {
              id: 'claude-sonnet',
              label: 'Claude Sonnet',
              defaultEffort: 'medium',
              effortOptions: [
                { id: 'low', label: 'Low' },
                { id: 'medium', label: 'Medium' },
                { id: 'high', label: 'High' },
              ],
            },
          ],
          attachments: {
            supportsImage: true,
            supportsPdf: true,
            supportsText: true,
            maxImageBytes: 10 * 1024 * 1024,
            maxPdfBytes: 20 * 1024 * 1024,
            maxTextBytes: 1024 * 1024,
            maxTotalBytes: 50 * 1024 * 1024,
          },
        },
      ],
      loadProviders,
      createAndStartSession,
      sendMessageToSession,
      error: null,
    })
  })

  it('continues a failed continuable session instead of creating a new one', () => {
    render(
      <ComposerContainer
        projectId="project-1"
        workspaceId={null}
        activeSessionId="session-1"
      />,
    )

    const textbox = screen.getByRole('textbox')

    expect(
      screen.getByPlaceholderText('Send a follow-up...'),
    ).toBeInTheDocument()

    fireEvent.change(textbox, {
      target: { value: 'Try again in this session' },
    })
    fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

    const state = useSessionStore.getState()
    expect(state.sendMessageToSession).toHaveBeenCalledWith(
      'session-1',
      'Try again in this session',
    )
    expect(state.createAndStartSession).not.toHaveBeenCalled()
  })
})
