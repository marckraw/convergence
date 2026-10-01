import { vi } from 'vitest'
import { normalizeProjectSettings, useProjectStore } from '@/entities/project'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useAttachmentStore } from '@/entities/attachment'
import {
  useProjectContextStore,
  type ProjectContextItem,
} from '@/entities/project-context'
import { localProviderCatalogs, useSessionStore } from '@/entities/session'
import { useSessionRelayStore } from '@/entities/session-relay'
import { useSkillStore } from '@/entities/skill'
import type { TurnDelta } from '@/entities/turn'

/**
 * The world a mounted `ComposerContainer` stands in: the preload bridge it
 * calls and the stores it reads, seeded the same way for every test that
 * mounts one (MAR-3609).
 *
 * Two layers' tests mount it. The composer's own, in `features/composer`, and
 * the render budget (MAR-3325), which mounts it beside the session's wires and
 * so lives in `widgets/session-view`: a feature may not import a widget. Test
 * support for both cannot sit inside either slice -- neither may reach into the
 * other's files -- so it sits here, outside the layers, as `walk-budget.ts`
 * does.
 */

/** The project's one context item, seeded for `project-1`. */
export const projectContextItem: ProjectContextItem = {
  id: 'ctx-chaperone',
  projectId: 'project-1',
  label: 'chaperone project',
  body: '/Users/marckraw/Projects/OpenSource/chaperone',
  reinjectMode: 'boot',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

export const FAST_TIER = {
  id: 'priority',
  name: 'Fast',
  description: '2x speed, increased usage',
}

/**
 * What a test varies in the preload bridge. Each is read when the composer
 * calls, so a test that reassigns what it hands back is answered with the new
 * value. Left out, each answers as the composer's tests do by default: no
 * accounts, no turns, a listener nobody keeps, and Fast on GPT-5.5.
 */
export interface ComposerBridgeDoubles {
  providerAccounts?: () => unknown[]
  sessionTurns?: () => unknown[]
  onTurnDelta?: (listener: (delta: TurnDelta) => void) => () => void
  codexSpeedList?: (...args: never[]) => Promise<unknown>
}

/** Installs the preload bridge the composer calls on `window.electronAPI`. */
export function installComposerBridge(doubles: ComposerBridgeDoubles = {}) {
  const providerAccounts = doubles.providerAccounts ?? (() => [])
  const sessionTurns = doubles.sessionTurns ?? (() => [])
  const onTurnDelta = doubles.onTurnDelta ?? (() => () => {})
  const codexSpeedList =
    doubles.codexSpeedList ??
    vi.fn(async () => ({
      status: 'available' as const,
      checkedAt: '2026-10-01T00:00:00.000Z',
      models: { 'gpt-5.5': { tiers: [FAST_TIER], defaultTier: null } },
    }))
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    providerAccounts: {
      list: vi.fn(() => Promise.resolve(providerAccounts())),
    },
    turns: {
      listForSession: vi.fn(() => Promise.resolve(sessionTurns())),
      onTurnDelta: vi.fn(onTurnDelta),
    },
    git: {
      getCloneableRepositoryUrl: vi.fn(() =>
        Promise.resolve('https://github.com/marckraw/new-blok.git'),
      ),
    },
    executionHost: {
      getProjects: vi.fn(() =>
        Promise.resolve({
          executionHostId: 'local',
          supported: false,
          projects: [],
          unreachableReason: null,
        }),
      ),
    },
    codexSpeed: {
      list: codexSpeedList,
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
}

/**
 * Seeds every store the composer reads: one failed Claude Code session in
 * `project-1`, this machine's catalog, the skills, the project, no wires, no
 * drafts, the project's context item, and the default provider settings. The
 * store actions the composer calls are fresh spies.
 */
export function seedComposerStores() {
  useSessionStore.setState({ accountHandoffRefusals: {} })

  const loadProviders = vi.fn()
  const loadProviderCatalog = vi.fn()
  const loadRemoteProjectCatalog = vi.fn()
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
    providerCatalogs: localProviderCatalogs([
      {
        id: 'claude-code',
        name: 'Claude Code',
        vendorLabel: 'Anthropic',
        kind: 'conversation',
        supportsContinuation: true,
        supportsConversationReset: false,
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
    ]),
    queuedInputsBySessionId: {},
    loadProviders,
    loadProviderCatalog,
    loadRemoteProjectCatalog,
    remoteProjectCatalogs: {},
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

  // The project the composer is aimed at, so the strip can say what a daemon
  // would clone for it (MAR-2689).
  useProjectStore.setState({
    projects: [
      {
        id: 'project-1',
        name: 'Project',
        repositoryPath: '/tmp/project-1',
        settings: normalizeProjectSettings(undefined),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        laneOf: null,
        laneName: null,
      },
    ],
  })

  useSessionRelayStore.setState({ relays: [], isLoaded: true })
  // A fresh ingest spy per test: the drop path calls the store action
  // directly, and a mock left standing would count a neighbour's drop.
  useAttachmentStore.setState({
    drafts: {},
    resolved: {},
    ingestFiles: vi.fn().mockResolvedValue(undefined),
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
      defaultProviderId: 'claude-code',
      defaultModelId: 'claude-sonnet',
      defaultEffortId: 'medium',
      piModelVisibility: { additionalModelIds: [] },
      // Endpoints are settings, and settings survive a render. Without this
      // reset, whether the strip is hidden depends on which test ran first.
      executionHostEndpoints: [],
    },
    isLoaded: true,
  }))
}

/** A wire leaving `sessionId` for `session-2`, armed unless said otherwise. */
export function wireLeaving(sessionId: string, armed = true) {
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
    conditionToken: null,
    armed,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
}

/** Puts `inputs` in `session-1`'s queue. */
export function seedQueuedInputs(inputs: unknown[]) {
  useSessionStore.setState({
    queuedInputsBySessionId: { 'session-1': inputs as never },
  })
}

/** A follow-up queued in `session-1`, waiting, with `overrides` on top. */
export function queuedInput(overrides: Record<string, unknown>) {
  return {
    id: 'q-1',
    sessionId: 'session-1',
    deliveryMode: 'follow-up',
    state: 'queued',
    text: 'RUN100 round 1, lap 1 of 6',
    attachmentIds: [],
    skillSelections: [],
    providerRequestId: null,
    providerAccountId: null,
    skipContextInjection: false,
    relaysMuted: false,
    dispatchId: 'dispatch-1',
    queuePosition: 1,
    redeliveredBy: false,
    error: null,
    createdAt: '2026-09-11T22:20:25.000Z',
    updatedAt: '2026-09-11T22:20:25.000Z',
    ...overrides,
  }
}
