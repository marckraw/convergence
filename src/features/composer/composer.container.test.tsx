import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ComposerContainer } from './composer.container'
import { useSessionStore } from '@/entities/session'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useSkillStore } from '@/entities/skill'
import {
  useProjectContextStore,
  type ProjectContextItem,
} from '@/entities/project-context'

const projectContextItem: ProjectContextItem = {
  id: 'ctx-chaperone',
  projectId: 'project-1',
  label: 'chaperone project',
  body: '/Users/marckraw/Projects/OpenSource/chaperone',
  reinjectMode: 'boot',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const codexProvider = {
  id: 'codex',
  name: 'Codex',
  vendorLabel: 'OpenAI',
  kind: 'conversation' as const,
  supportsContinuation: true,
  defaultModelId: 'gpt-5.5',
  fastModelId: 'gpt-5.4-mini',
  modelOptions: [
    {
      id: 'gpt-5.5',
      label: 'GPT-5.5',
      defaultEffort: 'medium' as const,
      effortOptions: [
        { id: 'minimal' as const, label: 'Minimal' },
        { id: 'medium' as const, label: 'Medium' },
        { id: 'high' as const, label: 'High' },
      ],
    },
  ],
  attachments: {
    supportsImage: true,
    supportsPdf: false,
    supportsText: true,
    maxImageBytes: 10 * 1024 * 1024,
    maxPdfBytes: 0,
    maxTextBytes: 1024 * 1024,
    maxTotalBytes: 50 * 1024 * 1024,
  },
  midRunInput: {
    supportsAnswer: true,
    supportsNativeFollowUp: false,
    supportsAppQueuedFollowUp: true,
    supportsSteer: true,
    supportsInterrupt: true,
    defaultRunningMode: 'follow-up' as const,
  },
}

describe('ComposerContainer', () => {
  beforeEach(() => {
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      providerQuota: {
        list: vi.fn().mockResolvedValue([
          {
            providerId: 'codex',
            status: 'available',
            source: 'provider-api',
            planType: 'pro',
            windows: [
              {
                kind: 'five-hour',
                label: '5 hour usage limit',
                usedPercent: 13,
                remainingPercent: 87,
                windowMinutes: 300,
                resetsAt: '2026-05-21T15:21:00.000Z',
              },
              {
                kind: 'weekly',
                label: 'Weekly usage limit',
                usedPercent: 5,
                remainingPercent: 95,
                windowMinutes: 10_080,
                resetsAt: '2026-05-26T22:00:00.000Z',
              },
            ],
            credits: null,
            limitReachedType: null,
            lastCheckedAt: '2026-05-21T12:00:00.000Z',
            stale: false,
          },
          {
            providerId: 'claude-code',
            status: 'available',
            source: 'local-usage-log',
            planType: null,
            windows: [
              {
                kind: 'five-hour',
                label: 'Current 5-hour Claude usage',
                usedPercent: 22,
                remainingPercent: 78,
                windowMinutes: 300,
                resetsAt: '2026-06-17T19:00:00.000Z',
                displayMode: 'observed-usage',
                valueLabel: '9.4M tokens, $6.81',
                resetLabel: 'Ends',
              },
              {
                kind: 'weekly',
                label: "This week's Claude usage",
                usedPercent: 42,
                remainingPercent: 58,
                windowMinutes: 10_080,
                resetsAt: '2026-06-21T00:00:00.000Z',
                displayMode: 'observed-usage',
                valueLabel: '371.9M tokens, $370.55',
                resetLabel: 'Ends',
              },
            ],
            credits: null,
            limitReachedType: null,
            lastCheckedAt: '2026-06-17T15:03:00.000Z',
            stale: false,
          },
        ]),
      },
    }

    const loadProviders = vi.fn()
    const createAndStartSession = vi.fn()
    const createAndStartGlobalSession = vi.fn()
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
          contextKind: 'project',
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
      globalChatSessions: [],
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
      createAndStartGlobalSession,
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
      loadGlobalCatalog: vi.fn().mockResolvedValue({
        ...catalog,
        projectId: 'global',
        projectName: 'Global chat',
      }),
    })

    useProjectContextStore.setState({
      itemsByProjectId: { 'project-1': [projectContextItem] },
      attachmentsBySessionId: {},
      loading: false,
      error: null,
      loadForProject: vi.fn().mockResolvedValue(undefined),
    })

    useAppSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        piModelVisibility: { additionalModelIds: [] },
      },
      isLoaded: true,
    }))
  })

  it('continues a failed continuable session instead of creating a new one', () => {
    render(
      <ComposerContainer
        context={{
          kind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          activeSessionId: 'session-1',
        }}
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
        context={{
          kind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          activeSessionId: 'session-1',
        }}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Add composer resources' }),
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

  it('passes selected project context items when creating a new session from the composer', () => {
    render(
      <ComposerContainer
        context={{
          kind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          activeSessionId: null,
        }}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Add composer resources' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Select project context' }),
    )
    fireEvent.click(screen.getByRole('button', { name: /chaperone project/ }))

    const textbox = screen.getByRole('textbox')
    fireEvent.change(textbox, {
      target: { value: 'Use the linked chaperone project' },
    })
    fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

    expect(
      useSessionStore.getState().createAndStartSession,
    ).toHaveBeenCalledWith(
      'project-1',
      null,
      'claude-code',
      'claude-sonnet',
      'medium',
      'Use the linked chaperone project',
      'Use the linked chaperone project',
      undefined,
      undefined,
      ['ctx-chaperone'],
      { preset: 'ask' },
      null,
      undefined,
    )
  })

  it('hides the remote host toggle when no remote execution host is configured', () => {
    render(
      <ComposerContainer
        context={{
          kind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          activeSessionId: null,
        }}
      />,
    )

    expect(
      screen.queryByRole('switch', { name: 'Run on remote host' }),
    ).not.toBeInTheDocument()
  })

  it('starts the session on the remote host when the toggle is on', () => {
    useAppSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        executionHostRemoteBaseUrl: 'https://daemon.example.com',
      },
    }))

    render(
      <ComposerContainer
        context={{
          kind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          activeSessionId: null,
        }}
      />,
    )

    fireEvent.click(screen.getByRole('switch', { name: 'Run on remote host' }))

    const textbox = screen.getByRole('textbox')
    fireEvent.change(textbox, { target: { value: 'Run remotely' } })
    fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

    expect(
      useSessionStore.getState().createAndStartSession,
    ).toHaveBeenCalledWith(
      'project-1',
      null,
      'claude-code',
      'claude-sonnet',
      'medium',
      'Run remotely',
      'Run remotely',
      undefined,
      undefined,
      undefined,
      { preset: 'ask' },
      null,
      'remote',
    )
  })

  it('creates a global session and hides project context controls', () => {
    render(
      <ComposerContainer
        context={{
          kind: 'global',
          activeSessionId: null,
        }}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Add composer resources' }),
    )

    expect(
      screen.queryByRole('button', { name: 'Select project context' }),
    ).not.toBeInTheDocument()

    const textbox = screen.getByRole('textbox')
    fireEvent.change(textbox, {
      target: { value: 'General chat request' },
    })
    fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

    expect(
      useSessionStore.getState().createAndStartGlobalSession,
    ).toHaveBeenCalledWith(
      'claude-code',
      'claude-sonnet',
      'medium',
      'General chat request',
      'General chat request',
      undefined,
      undefined,
      { preset: 'ask' },
      null,
    )
    expect(
      useSessionStore.getState().createAndStartSession,
    ).not.toHaveBeenCalled()
    expect(
      useProjectContextStore.getState().loadForProject,
    ).not.toHaveBeenCalled()
  })

  it('applies explicit context when starting a new global session', () => {
    render(
      <ComposerContainer
        context={{
          kind: 'global',
          activeSessionId: null,
        }}
        prepareNewSessionMessage={(message) => `Context\n\n${message}`}
      />,
    )

    const textbox = screen.getByRole('textbox')
    fireEvent.change(textbox, {
      target: { value: 'General chat request' },
    })
    fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

    expect(
      useSessionStore.getState().createAndStartGlobalSession,
    ).toHaveBeenCalledWith(
      'claude-code',
      'claude-sonnet',
      'medium',
      'General chat request',
      'Context\n\nGeneral chat request',
      undefined,
      undefined,
      { preset: 'ask' },
      null,
    )
  })

  it('starts new Codex sessions with fast mode off by default', () => {
    useSessionStore.setState({ providers: [codexProvider] })

    render(
      <ComposerContainer
        context={{
          kind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          activeSessionId: null,
        }}
      />,
    )

    expect(screen.getByRole('switch', { name: 'Fast mode' })).toHaveAttribute(
      'aria-checked',
      'false',
    )

    const textbox = screen.getByRole('textbox')
    fireEvent.change(textbox, {
      target: { value: 'Use Codex default tier' },
    })
    fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

    expect(
      useSessionStore.getState().createAndStartSession,
    ).toHaveBeenCalledWith(
      'project-1',
      null,
      'codex',
      'gpt-5.5',
      'medium',
      'Use Codex default tier',
      'Use Codex default tier',
      undefined,
      undefined,
      undefined,
      { preset: 'ask' },
      'default',
      undefined,
    )
  })

  it('can turn on fast mode for a new Codex session', () => {
    useSessionStore.setState({ providers: [codexProvider] })

    render(
      <ComposerContainer
        context={{
          kind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          activeSessionId: null,
        }}
      />,
    )

    fireEvent.click(screen.getByRole('switch', { name: 'Fast mode' }))

    const textbox = screen.getByRole('textbox')
    fireEvent.change(textbox, {
      target: { value: 'Use Codex fast' },
    })
    fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

    expect(
      useSessionStore.getState().createAndStartSession,
    ).toHaveBeenCalledWith(
      'project-1',
      null,
      'codex',
      'gpt-5.5',
      'medium',
      'Use Codex fast',
      'Use Codex fast',
      undefined,
      undefined,
      undefined,
      { preset: 'ask' },
      'fast',
      undefined,
    )
  })

  it('passes yolo permission config when selected for a new session', () => {
    render(
      <ComposerContainer
        context={{
          kind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          activeSessionId: null,
        }}
      />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'Ask' }))
    fireEvent.click(screen.getByText('Yolo'))

    const textbox = screen.getByRole('textbox')
    fireEvent.change(textbox, {
      target: { value: 'Run the migration' },
    })
    fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

    expect(
      useSessionStore.getState().createAndStartSession,
    ).toHaveBeenCalledWith(
      'project-1',
      null,
      'claude-code',
      'claude-sonnet',
      'medium',
      'Run the migration',
      'Run the migration',
      undefined,
      undefined,
      undefined,
      { preset: 'yolo' },
      null,
      undefined,
    )
  })

  it('loads global skills when opening the skill picker in global chat', () => {
    render(
      <ComposerContainer
        context={{
          kind: 'global',
          activeSessionId: null,
        }}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Add composer resources' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Select skills' }))

    expect(useSkillStore.getState().loadGlobalCatalog).toHaveBeenCalled()
    expect(useSkillStore.getState().loadCatalog).not.toHaveBeenCalled()
  })

  it('reloads providers when Pi model visibility changes while mounted', async () => {
    const loadProviders = useSessionStore.getState().loadProviders

    render(
      <ComposerContainer
        context={{
          kind: 'global',
          activeSessionId: null,
        }}
      />,
    )

    await waitFor(() => expect(loadProviders).toHaveBeenCalledTimes(1))

    act(() => {
      useAppSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          piModelVisibility: { additionalModelIds: ['openai/gpt-5.5'] },
        },
      }))
    })

    await waitFor(() => expect(loadProviders).toHaveBeenCalledTimes(2))
  })

  it('shows Codex usage in the composer for Codex provider selections', async () => {
    const baseProvider = useSessionStore.getState().providers[0]
    if (!baseProvider) throw new Error('missing base test provider')

    useSessionStore.setState({
      providers: [
        {
          id: 'codex',
          name: 'Codex',
          vendorLabel: 'OpenAI',
          kind: 'conversation',
          supportsContinuation: true,
          defaultModelId: 'gpt-5.3-codex',
          modelOptions: [
            {
              id: 'gpt-5.3-codex',
              label: 'GPT-5.3 Codex',
              defaultEffort: 'medium',
              effortOptions: [
                { id: 'low', label: 'Low' },
                { id: 'medium', label: 'Medium' },
              ],
            },
          ],
          attachments: baseProvider.attachments,
          midRunInput: baseProvider.midRunInput,
        },
      ],
    })

    render(
      <ComposerContainer
        context={{
          kind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          activeSessionId: null,
        }}
      />,
    )

    expect(
      await screen.findByRole('button', {
        name: 'Codex usage 87% remaining',
      }),
    ).toBeInTheDocument()
    expect(window.electronAPI.providerQuota.list).toHaveBeenCalledWith(false)
  })

  it('shows Codex usage in the composer for Pi OpenAI model selections', async () => {
    const baseProvider = useSessionStore.getState().providers[0]
    if (!baseProvider) throw new Error('missing base test provider')

    useSessionStore.setState({
      providers: [
        {
          id: 'pi',
          name: 'Pi',
          vendorLabel: 'Pi',
          kind: 'conversation',
          supportsContinuation: true,
          defaultModelId: 'openai/gpt-5.3-codex',
          modelOptions: [
            {
              id: 'openai/gpt-5.3-codex',
              label: 'GPT-5.3 Codex',
              defaultEffort: 'medium',
              effortOptions: [
                { id: 'low', label: 'Low' },
                { id: 'medium', label: 'Medium' },
              ],
            },
          ],
          attachments: baseProvider.attachments,
          midRunInput: baseProvider.midRunInput,
        },
      ],
    })
    useAppSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        defaultProviderId: 'pi',
        defaultModelId: 'openai/gpt-5.3-codex',
        defaultEffortId: 'medium',
      },
    }))

    render(
      <ComposerContainer
        context={{
          kind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          activeSessionId: null,
        }}
      />,
    )

    expect(
      await screen.findByRole('button', {
        name: 'Codex usage 87% remaining',
      }),
    ).toBeInTheDocument()
    expect(window.electronAPI.providerQuota.list).toHaveBeenCalledWith(false)
  })

  it('shows Claude Code usage in the composer for Claude Code selections', async () => {
    useAppSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        defaultProviderId: 'claude-code',
        defaultModelId: 'claude-sonnet',
        defaultEffortId: 'medium',
      },
    }))

    render(
      <ComposerContainer
        context={{
          kind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          activeSessionId: null,
        }}
      />,
    )

    const pill = await screen.findByRole('button', {
      name: 'Claude Code usage 9.4M',
    })
    expect(pill).toBeInTheDocument()
    expect(window.electronAPI.providerQuota.list).toHaveBeenCalledWith(false)

    fireEvent.pointerEnter(pill)

    expect(await screen.findByText('Claude Code usage')).toBeInTheDocument()
    expect(screen.getByText('9.4M tokens, $6.81')).toBeInTheDocument()
    expect(screen.getByText('371.9M tokens, $370.55')).toBeInTheDocument()
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
        context={{
          kind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          activeSessionId: 'session-1',
        }}
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
        context={{
          kind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          activeSessionId: 'session-1',
        }}
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
        context={{
          kind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          activeSessionId: 'session-1',
        }}
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
