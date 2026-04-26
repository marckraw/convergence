import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ComposerContainer } from './composer.container'
import { useSessionStore } from '@/entities/session'
import { useSkillStore } from '@/entities/skill'

describe('ComposerContainer', () => {
  beforeEach(() => {
    const loadProviders = vi.fn()
    const createAndStartSession = vi.fn()
    const sendMessageToSession = vi.fn()
    const cancelQueuedInput = vi.fn()
    const testMidRunInput = {
      supportsAnswer: false,
      supportsNativeFollowUp: false,
      supportsAppQueuedFollowUp: true,
      supportsSteer: false,
      supportsInterrupt: false,
      defaultRunningMode: 'follow-up' as const,
    }
    const catalog = {
      projectId: 'project-1',
      projectName: 'Project',
      refreshedAt: '2026-04-25T00:00:00.000Z',
      providers: [
        {
          providerId: 'claude-code' as const,
          providerName: 'Claude Code',
          catalogSource: 'filesystem' as const,
          invocationSupport: 'native-command' as const,
          activationConfirmation: 'none' as const,
          error: null,
          skills: [
            {
              id: 'claude-code:global:planning',
              providerId: 'claude-code' as const,
              providerName: 'Claude Code',
              name: 'planning',
              displayName: 'Planning',
              description: 'Plan implementation work.',
              shortDescription: 'Plan implementation work.',
              path: '/skills/planning/SKILL.md',
              scope: 'global' as const,
              rawScope: null,
              sourceLabel: 'Global',
              enabled: true,
              dependencies: [],
              warnings: [],
            },
          ],
        },
      ],
    }

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
          activity: null,
          contextWindow: null,
          workingDirectory: '/tmp/project-1',
          archivedAt: null,
          parentSessionId: null,
          forkStrategy: null,
          primarySurface: 'conversation',
          continuationToken: null,
          lastSequence: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      providers: [
        {
          id: 'claude-code',
          name: 'Claude Code',
          vendorLabel: 'Anthropic',
          kind: 'conversation',
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
          midRunInput: testMidRunInput,
        },
      ],
      queuedInputsBySessionId: {},
      loadProviders,
      createAndStartSession,
      sendMessageToSession,
      cancelQueuedInput,
      error: null,
    })

    useSkillStore.setState({
      catalog,
      isCatalogLoading: false,
      catalogError: null,
      selectedSkillId: null,
      detailsBySkillId: {},
      detailsErrorBySkillId: {},
      loadingDetailsSkillId: null,
      loadCatalog: vi.fn().mockResolvedValue(catalog),
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

    const textbox = screen.getByPlaceholderText('Send a follow-up...')

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

  it('sends selected skills with a continuable session message', () => {
    render(
      <ComposerContainer
        projectId="project-1"
        workspaceId={null}
        activeSessionId="session-1"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Select skills' }))
    fireEvent.click(screen.getByRole('button', { name: /Planning/ }))

    const textbox = screen.getByPlaceholderText('Send a follow-up...')
    fireEvent.change(textbox, {
      target: { value: 'Try again with planning' },
    })
    fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

    const state = useSessionStore.getState()
    expect(state.sendMessageToSession).toHaveBeenCalledWith(
      'session-1',
      'Try again with planning',
      undefined,
      [
        {
          id: 'claude-code:global:planning',
          providerId: 'claude-code',
          providerName: 'Claude Code',
          name: 'planning',
          displayName: 'Planning',
          path: '/skills/planning/SKILL.md',
          scope: 'global',
          rawScope: null,
          sourceLabel: 'Global',
          status: 'selected',
        },
      ],
    )
  })

  it('allows follow-up while a supported provider session is running', () => {
    useSessionStore.setState((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === 'session-1'
          ? { ...session, status: 'running', attention: 'none' }
          : session,
      ),
    }))

    render(
      <ComposerContainer
        projectId="project-1"
        workspaceId={null}
        activeSessionId="session-1"
      />,
    )

    const textbox = screen.getByPlaceholderText('Queue a follow-up...')
    fireEvent.change(textbox, {
      target: { value: 'Check auth after this' },
    })
    fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

    expect(
      useSessionStore.getState().sendMessageToSession,
    ).toHaveBeenCalledWith(
      'session-1',
      'Check auth after this',
      undefined,
      undefined,
      'follow-up',
    )
  })

  it('keeps the composer disabled while running when no mode is supported', () => {
    useSessionStore.setState((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === 'session-1'
          ? { ...session, status: 'running', attention: 'none' }
          : session,
      ),
      providers: state.providers.map((provider) =>
        provider.id === 'claude-code'
          ? {
              ...provider,
              midRunInput: {
                supportsAnswer: false,
                supportsNativeFollowUp: false,
                supportsAppQueuedFollowUp: false,
                supportsSteer: false,
                supportsInterrupt: false,
                defaultRunningMode: null,
              },
            }
          : provider,
      ),
    }))

    render(
      <ComposerContainer
        projectId="project-1"
        workspaceId={null}
        activeSessionId="session-1"
      />,
    )

    expect(screen.getByPlaceholderText('Session is running...')).toBeDisabled()
  })

  it('sends answer mode when the provider is waiting for input', () => {
    useSessionStore.setState((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === 'session-1'
          ? { ...session, status: 'running', attention: 'needs-input' }
          : session,
      ),
      providers: state.providers.map((provider) =>
        provider.id === 'claude-code'
          ? {
              ...provider,
              midRunInput: {
                ...provider.midRunInput,
                supportsAnswer: true,
              },
            }
          : provider,
      ),
    }))

    render(
      <ComposerContainer
        projectId="project-1"
        workspaceId={null}
        activeSessionId="session-1"
      />,
    )

    const textbox = screen.getByPlaceholderText('Respond to the agent...')
    fireEvent.change(textbox, {
      target: { value: 'Use option B' },
    })
    fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

    expect(
      useSessionStore.getState().sendMessageToSession,
    ).toHaveBeenCalledWith(
      'session-1',
      'Use option B',
      undefined,
      undefined,
      'answer',
    )
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })
})
