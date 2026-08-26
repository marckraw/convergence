import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ComposerContainer } from './composer.container'
import { useSessionStore } from '@/entities/session'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useSessionRelayStore } from '@/entities/session-relay'
import { useAttachmentStore } from '@/entities/attachment'
import { useSkillStore } from '@/entities/skill'
import {
  useProjectContextStore,
  type ProjectContextItem,
} from '@/entities/project-context'

let providerAccountsMock: unknown[] = []
let sessionTurnsMock: unknown[] = []

function buildAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acct-a',
    providerId: 'claude-code',
    label: 'Personal Max',
    authKind: 'subscription-oauth',
    email: 'a@example.com',
    orgId: 'org-a',
    plan: 'max',
    configDir: '/config/acct-a',
    credentialDir: '/credentials/acct-a',
    executionHostId: 'local',
    isDefault: false,
    status: 'connected',
    lastValidatedAt: null,
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    ...overrides,
  }
}

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
    providerAccountsMock = []
    sessionTurnsMock = []
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      providerAccounts: {
        list: vi.fn(() => Promise.resolve(providerAccountsMock)),
      },
      turns: {
        listForSession: vi.fn(() => Promise.resolve(sessionTurnsMock)),
      },
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
            status: 'unavailable',
            source: 'manual',
            reason: 'Open the Claude usage page for live limits.',
            usageUrl: 'https://claude.ai/new#settings/usage',
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

    useSessionRelayStore.setState({ relays: [], isLoaded: true })
    useAttachmentStore.setState({ drafts: {}, resolved: {} })

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

  function wireLeaving(sessionId: string, armed = true) {
    return {
      id: `relay-${sessionId}-${armed ? 'armed' : 'disarmed'}`,
      crewId: 'crew-1',
      sourceSessionId: sessionId,
      trigger: 'settled' as const,
      action: 'hail' as const,
      targetSessionId: 'session-2',
      spawnSpec: null,
      instruction: null,
      opener: null,
      armed,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    }
  }

  function renderComposer() {
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
    return screen.getByPlaceholderText('Send a follow-up...')
  }

  describe('the quiet send (F10)', () => {
    it('shows no toggle at all when nothing leaves this session', () => {
      // A switch that silences nothing would sit on every composer in the app.
      useSessionRelayStore.setState({ relays: [], isLoaded: true })
      renderComposer()

      expect(screen.queryByRole('switch', { name: 'Send quiet' })).toBeNull()
    })

    it('shows no toggle when every wire leaving this session is disarmed', () => {
      useSessionRelayStore.setState({
        relays: [wireLeaving('session-1', false)],
        isLoaded: true,
      })
      renderComposer()

      expect(screen.queryByRole('switch', { name: 'Send quiet' })).toBeNull()
    })

    it('shows the toggle, off, when an armed wire leaves this session', () => {
      useSessionRelayStore.setState({
        relays: [wireLeaving('session-1')],
        isLoaded: true,
      })
      renderComposer()

      expect(
        screen.getByRole('switch', { name: 'Send quiet' }),
      ).toHaveAttribute('aria-checked', 'false')
    })

    it('sends quiet in the order a person actually does it: type, toggle, send', () => {
      // The natural order, and the one that breaks under a stale closure: the
      // send callback keeps the `relaysMuted` it was built with, so the message
      // goes out loud while the button says quiet -- the exact direction this
      // feature exists to prevent. Toggling BEFORE typing hides it, because the
      // next keystroke rebuilds the callback.
      //
      // An attachment sits on the draft on purpose. With no draft the
      // composer's `attachments` is a fresh `[]` literal every render, which
      // rebuilds that callback every render and masks the missing dependency
      // entirely; with a draft it is a stable reference out of the store. So
      // this is also the only shape in which a real user could hit the bug.
      useSessionRelayStore.setState({
        relays: [wireLeaving('session-1')],
        isLoaded: true,
      })
      useAttachmentStore.setState({
        drafts: {
          'session-1': {
            items: [
              {
                id: 'att-1',
                sessionId: 'session-1',
                kind: 'image',
                mimeType: 'image/png',
                filename: 'shot.png',
                sizeBytes: 4,
                storagePath: '/tmp/att-1.png',
                thumbnailPath: null,
                textPreview: null,
                createdAt: '2026-08-01T00:00:00.000Z',
              },
            ],
            rejections: [],
            ingestInFlight: false,
          },
        },
        resolved: {},
      })
      const textbox = renderComposer()

      fireEvent.change(textbox, { target: { value: '/compact' } })
      fireEvent.click(screen.getByRole('switch', { name: 'Send quiet' }))
      fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

      expect(
        useSessionStore.getState().sendMessageToSession,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ text: '/compact', muteRelays: true }),
      )
    })

    it('sends quiet when it is switched on, and resets itself afterwards', () => {
      useSessionRelayStore.setState({
        relays: [wireLeaving('session-1')],
        isLoaded: true,
      })
      const textbox = renderComposer()

      fireEvent.click(screen.getByRole('switch', { name: 'Send quiet' }))
      expect(
        screen.getByRole('switch', { name: 'Send quiet' }),
      ).toHaveAttribute('aria-checked', 'true')

      fireEvent.change(textbox, { target: { value: '/compact' } })
      fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

      expect(
        useSessionStore.getState().sendMessageToSession,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ text: '/compact', muteRelays: true }),
      )

      // The whole ruling, on screen: one quiet send, then armed again without
      // him having to switch anything back.
      expect(
        screen.getByRole('switch', { name: 'Send quiet' }),
      ).toHaveAttribute('aria-checked', 'false')
    })

    it('leaves an ordinary send exactly as it was before the quiet send existed', () => {
      useSessionRelayStore.setState({
        relays: [wireLeaving('session-1')],
        isLoaded: true,
      })
      const textbox = renderComposer()

      fireEvent.change(textbox, { target: { value: 'carry on' } })
      fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

      const call = (
        useSessionStore.getState().sendMessageToSession as ReturnType<
          typeof vi.fn
        >
      ).mock.calls[0][0]
      expect(call.muteRelays).toBeUndefined()
    })
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
    expect(state.sendMessageToSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      text: 'Try again in this session',
      attachmentIds: undefined,
      skillSelections: undefined,
      deliveryMode: undefined,
      providerAccountId: null,
    })
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
    expect(state.sendMessageToSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      text: 'Try again with planning',
      attachmentIds: undefined,
      skillSelections: [
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
      deliveryMode: undefined,
      providerAccountId: null,
    })
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
    ).toHaveBeenCalledWith({
      projectId: 'project-1',
      workspaceId: null,
      providerId: 'claude-code',
      model: 'claude-sonnet',
      effort: 'medium',
      name: 'Use the linked chaperone project',
      message: 'Use the linked chaperone project',
      attachmentIds: undefined,
      skillSelections: undefined,
      contextItemIds: ['ctx-chaperone'],
      permissionConfig: { preset: 'ask' },
      serviceTier: null,
      executionHost: undefined,
      providerAccountId: null,
    })
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
        executionHostEndpoints: [
          {
            id: 'daemon-a',
            label: 'Remote daemon',
            baseUrl: 'https://daemon.example.com',
            position: 0,
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
        ],
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
    ).toHaveBeenCalledWith({
      projectId: 'project-1',
      workspaceId: null,
      providerId: 'claude-code',
      model: 'claude-sonnet',
      effort: 'medium',
      name: 'Run remotely',
      message: 'Run remotely',
      attachmentIds: undefined,
      skillSelections: undefined,
      contextItemIds: undefined,
      permissionConfig: { preset: 'ask' },
      serviceTier: null,
      // Which machine, not whether: the toggle records the Endpoint's id.
      executionHost: 'daemon-a',
      providerAccountId: null,
    })
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
    ).toHaveBeenCalledWith({
      providerId: 'claude-code',
      model: 'claude-sonnet',
      effort: 'medium',
      name: 'General chat request',
      message: 'General chat request',
      attachmentIds: undefined,
      skillSelections: undefined,
      permissionConfig: { preset: 'ask' },
      serviceTier: null,
      providerAccountId: null,
    })
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
    ).toHaveBeenCalledWith({
      providerId: 'claude-code',
      model: 'claude-sonnet',
      effort: 'medium',
      name: 'General chat request',
      message: 'Context\n\nGeneral chat request',
      attachmentIds: undefined,
      skillSelections: undefined,
      permissionConfig: { preset: 'ask' },
      serviceTier: null,
      providerAccountId: null,
    })
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
    ).toHaveBeenCalledWith({
      projectId: 'project-1',
      workspaceId: null,
      providerId: 'codex',
      model: 'gpt-5.5',
      effort: 'medium',
      name: 'Use Codex default tier',
      message: 'Use Codex default tier',
      attachmentIds: undefined,
      skillSelections: undefined,
      contextItemIds: undefined,
      permissionConfig: { preset: 'ask' },
      serviceTier: 'default',
      executionHost: undefined,
      providerAccountId: null,
    })
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
    ).toHaveBeenCalledWith({
      projectId: 'project-1',
      workspaceId: null,
      providerId: 'codex',
      model: 'gpt-5.5',
      effort: 'medium',
      name: 'Use Codex fast',
      message: 'Use Codex fast',
      attachmentIds: undefined,
      skillSelections: undefined,
      contextItemIds: undefined,
      permissionConfig: { preset: 'ask' },
      serviceTier: 'fast',
      executionHost: undefined,
      providerAccountId: null,
    })
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
    ).toHaveBeenCalledWith({
      projectId: 'project-1',
      workspaceId: null,
      providerId: 'claude-code',
      model: 'claude-sonnet',
      effort: 'medium',
      name: 'Run the migration',
      message: 'Run the migration',
      attachmentIds: undefined,
      skillSelections: undefined,
      contextItemIds: undefined,
      permissionConfig: { preset: 'yolo' },
      serviceTier: null,
      executionHost: undefined,
      providerAccountId: null,
    })
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
    expect(window.electronAPI.providerQuota.list).toHaveBeenCalledWith(
      false,
      undefined,
    )
  })

  it('hides Codex usage in the composer for Pi sessions on OpenAI models', async () => {
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

    // The composer has to settle before asserting an absence, so wait for the
    // selected Pi model to render first.
    expect(await screen.findByText('GPT-5.3 Codex')).toBeInTheDocument()

    // Pi bills through its own credentials; Codex's quota is not this
    // session's quota, whatever model id Pi is running.
    expect(
      screen.queryByRole('button', { name: /Codex usage/ }),
    ).not.toBeInTheDocument()
  })

  it('never reads the quota surface for Claude Code selections (MAR-2401)', async () => {
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

    // The composer must settle before the absence below means anything.
    expect(await screen.findByText('Claude Sonnet')).toBeInTheDocument()

    expect(
      screen.queryByRole('button', { name: /Claude Code usage/ }),
    ).not.toBeInTheDocument()
    // The point of the removal: computing Claude usage meant re-parsing the
    // shared ~/.claude transcript store every two minutes. A Claude selection
    // must not reach the quota surface at all.
    expect(window.electronAPI.providerQuota.list).not.toHaveBeenCalled()
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
    ).toHaveBeenCalledWith({
      sessionId: 'session-1',
      text: 'Check auth after this',
      attachmentIds: undefined,
      skillSelections: undefined,
      deliveryMode: 'follow-up',
      interactionResponse: undefined,
      providerAccountId: null,
    })
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
    ).toHaveBeenCalledWith({
      sessionId: 'session-1',
      text: 'Use option B',
      attachmentIds: undefined,
      skillSelections: undefined,
      deliveryMode: 'answer',
      interactionResponse: undefined,
      providerAccountId: null,
    })
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })

  describe('the provider account selector', () => {
    it('stays out of the way when no account is enrolled', async () => {
      // Behaviour neutrality: with nothing enrolled the composer looks and
      // behaves exactly as it did before PA5.
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

      await waitFor(() => {
        expect(window.electronAPI.providerAccounts.list).toHaveBeenCalled()
      })
      expect(screen.queryByText('Default account')).not.toBeInTheDocument()
    })

    it('presents the account by identity once one is enrolled', async () => {
      providerAccountsMock = [buildAccount()]

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

      // No selection yet, so the trigger names the ambient default.
      await screen.findByText('Default account')

      fireEvent.click(screen.getByText('Default account'))
      expect(await screen.findByText('a@example.com')).toBeInTheDocument()
      expect(screen.getByText('Organization org-a')).toBeInTheDocument()
    })

    it('sends the next turn on the account the user picked', async () => {
      // The money shot: the same conversation continues on the new account.
      providerAccountsMock = [
        buildAccount({ id: 'acct-b', email: 'b@example.com' }),
      ]

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

      fireEvent.click(await screen.findByText('Default account'))
      fireEvent.click(await screen.findByText('b@example.com'))

      const textbox = screen.getByPlaceholderText('Send a follow-up...')
      fireEvent.change(textbox, { target: { value: 'continue on B' } })
      fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

      expect(
        useSessionStore.getState().sendMessageToSession,
      ).toHaveBeenCalledWith({
        sessionId: 'session-1',
        text: 'continue on B',
        attachmentIds: undefined,
        skillSelections: undefined,
        deliveryMode: undefined,
        interactionResponse: undefined,
        providerAccountId: 'acct-b',
      })
    })

    it('refuses to offer a local account to a remote session', async () => {
      // Accounts are host-scoped (PA10). The remote host runs on its own
      // credential, so offering a picker that silently did nothing would be
      // worse than saying why there is none.
      providerAccountsMock = [
        buildAccount({ id: 'acct-b', email: 'b@example.com' }),
      ]
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === 'session-1'
            ? { ...session, executionHost: 'daemon-a' }
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

      expect(
        await screen.findByText('Default account · local only'),
      ).toBeInTheDocument()
      expect(screen.queryByText('b@example.com')).not.toBeInTheDocument()
    })

    it('never sends a local account with a remote turn', async () => {
      providerAccountsMock = [
        buildAccount({ id: 'acct-b', email: 'b@example.com', isDefault: true }),
      ]
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === 'session-1'
            ? { ...session, executionHost: 'daemon-a' }
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

      await screen.findByText('Default account · local only')

      const textbox = screen.getByPlaceholderText('Send a follow-up...')
      fireEvent.change(textbox, { target: { value: 'run this remotely' } })
      fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

      // Even an enrolled *default* account is dropped: the backend refuses it,
      // and the two must not disagree about what is going to happen.
      expect(
        useSessionStore.getState().sendMessageToSession,
      ).toHaveBeenCalledWith({
        sessionId: 'session-1',
        text: 'run this remotely',
        attachmentIds: undefined,
        skillSelections: undefined,
        deliveryMode: undefined,
        interactionResponse: undefined,
        providerAccountId: null,
      })
    })

    it('shows the account that actually served the last turn', async () => {
      // PA4's record is the honest answer, not anything the composer remembers.
      providerAccountsMock = [
        buildAccount({ id: 'acct-b', email: 'b@example.com' }),
      ]
      sessionTurnsMock = [
        {
          id: 'turn-1',
          sessionId: 'session-1',
          sequence: 1,
          startedAt: '2026-08-03T00:00:00.000Z',
          endedAt: '2026-08-03T00:01:00.000Z',
          status: 'completed',
          summary: null,
          providerAccountId: 'acct-b',
        },
      ]

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

      expect(await screen.findByText('b@example.com')).toBeInTheDocument()
    })

    it('does not offer an account attestation disabled', async () => {
      providerAccountsMock = [buildAccount({ status: 'unavailable' })]

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

      fireEvent.click(await screen.findByText('Default account'))
      const option = await screen.findByText('a@example.com')
      expect(option.closest('[data-disabled="true"]')).not.toBeNull()

      fireEvent.click(option)

      const textbox = screen.getByPlaceholderText('Send a follow-up...')
      fireEvent.change(textbox, { target: { value: 'should stay ambient' } })
      fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

      expect(
        useSessionStore.getState().sendMessageToSession,
      ).toHaveBeenCalledWith({
        sessionId: 'session-1',
        text: 'should stay ambient',
        attachmentIds: undefined,
        skillSelections: undefined,
        deliveryMode: undefined,
        interactionResponse: undefined,
        providerAccountId: null,
      })
    })
  })

  /**
   * MAR-2550 — the selection row holds two different locks, and the whole
   * feature is the difference between them. The provider is fixed for the life
   * of a session; the model and effort are only fixed while a turn is in
   * flight.
   */
  describe('the model switch (MAR-2550)', () => {
    function setSessionState(
      patch: Partial<{
        status: string
        attention: string
        model: string
        providerId: string
      }>,
    ) {
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === 'session-1'
            ? ({ ...session, ...patch } as (typeof state.sessions)[number])
            : session,
        ),
      }))
    }

    function addSecondModel() {
      useSessionStore.setState((state) => ({
        providers: state.providers.map((provider) =>
          provider.id === 'claude-code'
            ? {
                ...provider,
                modelOptions: [
                  ...provider.modelOptions,
                  {
                    id: 'claude-opus',
                    label: 'Claude Opus',
                    defaultEffort: 'high' as const,
                    effortOptions: [
                      { id: 'low' as const, label: 'Low' },
                      { id: 'high' as const, label: 'High' },
                    ],
                  },
                ],
              }
            : provider,
        ),
      }))
    }

    it('keeps the provider locked on an idle session while the model opens', () => {
      // The two locks pulling apart. If one boolean still drove both, the
      // provider select would be enabled here -- which Marcin has forbidden,
      // because a continuation token is provider-specific.
      setSessionState({ status: 'completed', attention: 'finished' })
      renderComposer()

      expect(screen.getByRole('combobox', { name: 'Anthropic' })).toBeDisabled()
      expect(
        screen.getByRole('combobox', { name: 'Claude Sonnet' }),
      ).toBeEnabled()
      expect(screen.getByRole('combobox', { name: 'Medium' })).toBeEnabled()
    })

    it('locks the model and effort while a turn is running', () => {
      setSessionState({ status: 'running', attention: 'none' })
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

      expect(
        screen.getByRole('combobox', { name: 'Claude Sonnet' }),
      ).toBeDisabled()
      expect(screen.getByRole('combobox', { name: 'Medium' })).toBeDisabled()
      expect(screen.getByRole('combobox', { name: 'Anthropic' })).toBeDisabled()
    })

    it('locks the model while the agent is waiting on the human', () => {
      setSessionState({ status: 'idle', attention: 'needs-input' })
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

      expect(
        screen.getByRole('combobox', { name: 'Claude Sonnet' }),
      ).toBeDisabled()
    })

    it('writes a model change to the session row rather than only the composer', async () => {
      const setSessionModelSelection = vi.fn().mockResolvedValue(undefined)
      useSessionStore.setState({ setSessionModelSelection })
      setSessionState({ status: 'completed', attention: 'finished' })
      addSecondModel()
      renderComposer()

      fireEvent.click(screen.getByRole('combobox', { name: 'Claude Sonnet' }))
      fireEvent.click(await screen.findByText('Claude Opus'))

      await waitFor(() => {
        expect(setSessionModelSelection).toHaveBeenCalledWith('session-1', {
          providerId: 'claude-code',
          model: 'claude-opus',
          effort: 'high',
        })
      })
    })

    it('writes an effort change to the session row too', async () => {
      const setSessionModelSelection = vi.fn().mockResolvedValue(undefined)
      useSessionStore.setState({ setSessionModelSelection })
      setSessionState({ status: 'completed', attention: 'finished' })
      renderComposer()

      fireEvent.click(screen.getByRole('combobox', { name: 'Medium' }))
      fireEvent.click(await screen.findByText('High'))

      await waitFor(() => {
        expect(setSessionModelSelection).toHaveBeenCalledWith('session-1', {
          providerId: 'claude-code',
          model: 'claude-sonnet',
          effort: 'high',
        })
      })
    })

    it('keeps showing the old model when the backend refuses the change', async () => {
      // Nothing optimistic. A composer that redrew itself and then lost the
      // write would be telling the human their next turn runs on a model it
      // does not -- the control that looks active while doing nothing.
      const setSessionModelSelection = vi
        .fn()
        .mockRejectedValue(new Error('Model and effort can only change...'))
      useSessionStore.setState({ setSessionModelSelection })
      setSessionState({ status: 'completed', attention: 'finished' })
      addSecondModel()
      renderComposer()

      fireEvent.click(screen.getByRole('combobox', { name: 'Claude Sonnet' }))
      fireEvent.click(await screen.findByText('Claude Opus'))

      await waitFor(() => {
        expect(setSessionModelSelection).toHaveBeenCalled()
      })
      expect(
        screen.getByRole('combobox', { name: 'Claude Sonnet' }),
      ).toBeInTheDocument()
    })

    it('leaves a draft composer free to pick both provider and model', () => {
      // No session yet: neither lock applies, and the write goes nowhere near
      // the row because there is no row.
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

      expect(screen.getByRole('combobox', { name: 'Anthropic' })).toBeEnabled()
      expect(
        screen.getByRole('combobox', { name: 'Claude Sonnet' }),
      ).toBeEnabled()
    })

    it('treats a session whose provider cannot continue as a draft', async () => {
      // The fourth situation the one mode has to answer, and the shell
      // provider is the live example. Its next send starts a new session, so
      // the pickers configure that -- they must not write to the row behind
      // them, and the provider is not fixed to anything.
      const setSessionModelSelection = vi.fn().mockResolvedValue(undefined)
      useSessionStore.setState((state) => ({
        setSessionModelSelection,
        providers: [
          {
            ...state.providers[0]!,
            id: 'shell',
            name: 'Shell',
            vendorLabel: 'Local',
            supportsContinuation: false,
          },
        ],
      }))
      setSessionState({
        status: 'completed',
        attention: 'finished',
        providerId: 'shell',
      })
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

      expect(screen.getByRole('combobox', { name: 'Local' })).toBeEnabled()

      fireEvent.click(screen.getByRole('combobox', { name: 'Medium' }))
      fireEvent.click(await screen.findByText('High'))

      expect(setSessionModelSelection).not.toHaveBeenCalled()
    })

    /**
     * The third state, named (MAR-2550). A session whose provider has left the
     * catalog is not a draft and not a continuable session -- and while it had
     * no name, the two booleans that governed the row disagreed about it: one
     * asked "can this continue?" and unlocked the provider select, the other
     * asked "is there a session?" and kept writing to the hidden row.
     */
    describe('the third state: the session provider has left the catalog', () => {
      function strandTheSession() {
        // Claude Code gone, Codex first in the catalog -- so an unscoped
        // resolve hands back "OpenAI" for a row that says claude-code.
        useSessionStore.setState({ providers: [codexProvider] })
      }

      it('locks the provider, the model and the effort together', () => {
        const setSessionModelSelection = vi.fn().mockResolvedValue(undefined)
        useSessionStore.setState({ setSessionModelSelection })
        setSessionState({ status: 'completed', attention: 'finished' })
        strandTheSession()
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

        expect(
          screen.getByRole('combobox', { name: 'claude-code (unavailable)' }),
        ).toBeDisabled()
        expect(
          screen.getByRole('combobox', { name: 'claude-sonnet' }),
        ).toBeDisabled()
        expect(screen.getByRole('combobox', { name: 'medium' })).toBeDisabled()
        expect(setSessionModelSelection).not.toHaveBeenCalled()
      })

      it('shows the session own provider rather than whichever is first', () => {
        // The honesty half. A composer reading "OpenAI" over a Claude row is
        // the interface lying about what the next action would do.
        setSessionState({ status: 'completed', attention: 'finished' })
        strandTheSession()
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

        expect(screen.queryByRole('combobox', { name: 'OpenAI' })).toBeNull()
        expect(screen.queryByText('GPT-5.5')).toBeNull()
      })

      it('refuses a send that was already typed when the provider vanished', () => {
        // The submit guard on its own, with the greyed box taken out of the
        // argument: the text is in the composer before the catalog loses the
        // provider, so keyDown reaches handleSubmit with a real message.
        // Before the mode existed this fell through to the draft path and would
        // have created a brand new Codex session out of a Claude row.
        setSessionState({ status: 'completed', attention: 'finished' })
        const textbox = renderComposer()
        fireEvent.change(textbox, { target: { value: 'carry on' } })

        act(() => strandTheSession())
        fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

        expect(
          useSessionStore.getState().sendMessageToSession,
        ).not.toHaveBeenCalled()
        expect(
          useSessionStore.getState().createAndStartSession,
        ).not.toHaveBeenCalled()
      })

      it('lets no write reach the row, by send or by pickers', () => {
        // Submit is a control too. Before the mode existed this composer fell
        // through to the draft path and would have created a brand new Codex
        // session out of a Claude row the human was looking at.
        const setSessionModelSelection = vi.fn().mockResolvedValue(undefined)
        useSessionStore.setState({ setSessionModelSelection })
        setSessionState({ status: 'completed', attention: 'finished' })
        strandTheSession()
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

        const textbox = screen.getByPlaceholderText(
          'claude-code is unavailable, so this session cannot continue.',
        )

        // fireEvent dispatches straight at the handler, so this reaches
        // handleSubmit whether or not the box is greyed -- which is the point:
        // the refusal has to live in the submit path, not only in a class name.
        fireEvent.change(textbox, { target: { value: 'carry on' } })
        fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

        expect(
          useSessionStore.getState().sendMessageToSession,
        ).not.toHaveBeenCalled()
        expect(
          useSessionStore.getState().createAndStartSession,
        ).not.toHaveBeenCalled()
        expect(setSessionModelSelection).not.toHaveBeenCalled()
        expect(textbox).toBeDisabled()
      })
    })

    /**
     * The provider lock has two controls to survive, not one. The select beside
     * the model picker was locked; the model dialog was not, and it reports a
     * provider with every pick -- so it was a second, quieter provider switch
     * that wrote a foreign model id onto the row.
     */
    describe('the second door: the model dialog carries a provider too', () => {
      function addCodexProvider() {
        useSessionStore.setState((state) => ({
          providers: [...state.providers, codexProvider],
        }))
      }

      it('offers an active session no provider but its own, by any route', async () => {
        setSessionState({ status: 'completed', attention: 'finished' })
        addCodexProvider()
        renderComposer()

        fireEvent.click(screen.getByRole('combobox', { name: 'Claude Sonnet' }))
        await screen.findByPlaceholderText('Search models...')

        // The filter that names the foreign provider is not there to click.
        expect(screen.queryByText('OpenAI')).toBeNull()

        // Nor does the filter that names no provider reach any further.
        fireEvent.click(screen.getByRole('button', { name: /^All/ }))
        expect(screen.queryByText('GPT-5.5')).toBeNull()

        // Nor does the search box, which answers from the same catalog.
        fireEvent.change(screen.getByPlaceholderText('Search models...'), {
          target: { value: 'gpt' },
        })
        expect(await screen.findByText('No models found.')).toBeInTheDocument()
      })

      it('still offers a draft every provider in the catalog', async () => {
        // The control for the test above: the dialog is scoped, not broken.
        // This is the exact click sequence that escaped an active session.
        addCodexProvider()
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

        fireEvent.click(screen.getByRole('combobox', { name: 'Claude Sonnet' }))
        await screen.findByPlaceholderText('Search models...')

        fireEvent.click(screen.getByRole('button', { name: /^OpenAI/ }))
        expect(await screen.findByText('GPT-5.5')).toBeInTheDocument()
      })

      it('names the provider it believes in, so the backend can disagree', async () => {
        // The renderer cannot be the only guard -- this run exists because a
        // renderer-only guard was removed from one control and nobody noticed.
        // Sending the provider the selection was made against is what lets the
        // refusal live where the row is written.
        const setSessionModelSelection = vi.fn().mockResolvedValue(undefined)
        useSessionStore.setState({ setSessionModelSelection })
        setSessionState({ status: 'completed', attention: 'finished' })
        addCodexProvider()
        renderComposer()

        fireEvent.click(screen.getByRole('combobox', { name: 'Medium' }))
        fireEvent.click(await screen.findByText('High'))

        await waitFor(() => {
          expect(setSessionModelSelection).toHaveBeenCalledWith('session-1', {
            providerId: 'claude-code',
            model: 'claude-sonnet',
            effort: 'high',
          })
        })
      })
    })
  })
})
