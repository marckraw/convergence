import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ComposerContainer } from './composer.container'
import {
  landedProviderCatalog,
  landedRemoteProjectCatalog,
  localProviderCatalogs,
  providerCatalogOf,
  providerCatalogSourceForHost,
  selectLocalProviders,
  useSessionStore,
  type ProviderCatalogEntry,
  type ProviderInfo,
  type RemoteProject,
} from '@/entities/session'
import { normalizeProjectSettings, useProjectStore } from '@/entities/project'
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

function endpointFixture(
  id: string,
  label: string,
  position: number,
  configurationEpoch = 0,
) {
  return {
    id,
    label,
    baseUrl: `https://${id}.example.com`,
    position,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    configurationEpoch,
  }
}

function setEndpoints(endpoints: ReturnType<typeof endpointFixture>[]): void {
  act(() => {
    useAppSettingsStore.setState((state) => ({
      settings: { ...state.settings, executionHostEndpoints: endpoints },
    }))
  })
}

/**
 * A remote provider descriptor, in the shape the daemon's catalog arrives in:
 * the local provider id (a session records that one) and the daemon's own
 * model slugs, which are not this machine's.
 */
function remoteProvider(
  id: string,
  name: string,
  models: { id: string; label: string }[],
) {
  return {
    id,
    name,
    vendorLabel: 'Remote daemon',
    kind: 'conversation' as const,
    supportsContinuation: true,
    defaultModelId: models[0]?.id ?? '',
    modelOptions: models.map((model) => ({
      ...model,
      defaultEffort: null,
      effortOptions: [],
    })),
    attachments: {
      supportsImage: false,
      supportsPdf: false,
      supportsText: false,
      maxImageBytes: 0,
      maxPdfBytes: 0,
      maxTextBytes: 0,
      maxTotalBytes: 0,
    },
    midRunInput: {
      supportsAnswer: false,
      supportsNativeFollowUp: true,
      supportsAppQueuedFollowUp: false,
      supportsSteer: false,
      supportsInterrupt: true,
      defaultRunningMode: 'follow-up' as const,
    },
  }
}

/**
 * Files a landed catalog for one machine, built through the product's own
 * derivation.
 *
 * The source is resolved the same way the container resolves it, so a fixture
 * cannot file a catalog under a pairing the app could never produce — which is
 * the whole point of keying catalogs by machine (MAR-2682).
 */
function seedCatalog(
  hostId: string,
  entries: ProviderCatalogEntry[],
  unreachableReason: string | null = null,
): void {
  const source = providerCatalogSourceForHost(
    hostId,
    useAppSettingsStore.getState().settings.executionHostEndpoints,
  )
  act(() => {
    useSessionStore.setState((state) => ({
      providerCatalogs: {
        ...state.providerCatalogs,
        [source.executionHostId]: landedProviderCatalog(
          source,
          providerCatalogOf(hostId, entries, unreachableReason),
        ),
      },
    }))
  })
}

/**
 * Files a landed Projects catalog for one machine, through the product's own
 * derivation (MAR-2689). The source is resolved exactly as the container
 * resolves it, so a fixture cannot file a catalog under a pairing the app could
 * never produce.
 */
function seedRemoteProjects(
  hostId: string,
  projects: RemoteProject[],
  overrides: { supported?: boolean; unreachableReason?: string | null } = {},
): void {
  const source = providerCatalogSourceForHost(
    hostId,
    useAppSettingsStore.getState().settings.executionHostEndpoints,
  )
  act(() => {
    useSessionStore.setState((state) => ({
      remoteProjectCatalogs: {
        ...state.remoteProjectCatalogs,
        [source.executionHostId]: landedRemoteProjectCatalog(source, {
          executionHostId: hostId,
          supported: overrides.supported ?? true,
          projects,
          unreachableReason: overrides.unreachableReason ?? null,
        }),
      },
    }))
  })
}

/** The Project on a daemon that holds this project's repository. */
const REMOTE_PROJECT: RemoteProject = {
  id: 'new-blok',
  name: 'new-blok',
  workingDirectory: '/srv/projects/new-blok',
  origin: 'https://github.com/marckraw/new-blok.git',
}

/**
 * A class attribute as whole tokens.
 *
 * Every styling assertion in this file goes through here. A substring match on
 * the class attribute cannot tell a class from its own negation:
 * `bg-transparent` contains `bg-`, `-mt-0` contains `-mt-`, and both would sail
 * past a prefix test while the surface was gone and the tuck was nothing. Match
 * whole classes or match nothing.
 *
 * `Element`, not `HTMLElement`, and `classList`, not `className`: the strip
 * carries SVG icons, whose `className` is an `SVGAnimatedString` rather than a
 * string. A sweep that could not read them would be a sweep with holes in it.
 */
function classTokens(element: Element): string[] {
  return Array.from(element.classList)
}

/** Whole classes, so the value is part of what is being matched. */
const TUCK_CLASS = /^-mt-(\d+(?:\.\d+)?)$/
const INSET_CLASS = /^mx-(\d+(?:\.\d+)?)$/
const SHADOW_CLASS = /^shadow(-(?:[a-z0-9]+|\[[^\]]+\]))?$/

/**
 * Every class that would draw a line along the strip's top edge: the top side
 * itself (`border-t`), both horizontal edges (`border-y`), and the all-sides
 * forms (`border`, `border-2`), which include the top.
 *
 * The family, not the one member. A width suffix is the same rule drawn
 * thicker, so `border-t-2` is not an escape from `border-t` — and asserting
 * `not.toContain('border-t')` on whole tokens is exactly the near-miss that
 * stays green while the separator is back and heavier than before. The
 * per-side survivors `border-x` and `border-b` are the look, so they must not
 * match here.
 */
const TOP_BORDER_CLASS = /^border(-[ty])?(-(?:\d+(?:\.\d+)?|\[[^\]]+\]))?$/

/**
 * The scale of a whole spacing class (`-mt-4` -> 4, `-mt-0` -> 0), or null when
 * the element carries no such class at all. Both zero and absent fail a knob
 * whose entire job is to be non-zero, and they read differently in the failure.
 */
function spacingScale(element: HTMLElement, pattern: RegExp): number | null {
  for (const token of classTokens(element)) {
    const match = pattern.exec(token)
    if (match) return Number(match[1])
  }
  return null
}

/** Whole classes again, and the arbitrary form counts: `z-[10]` is a layer. */
const Z_INDEX_CLASS = /^z-(?:(\d+)|\[(\d+)\])$/

/**
 * `relative z-10` -> 10. An element that is not positioned cannot claim a
 * layer at all, so it counts as 0 whatever `z-*` class it carries.
 */
function zIndexOf(element: HTMLElement): number {
  const tokens = classTokens(element)
  if (!tokens.includes('relative')) return 0
  for (const token of tokens) {
    const match = Z_INDEX_CLASS.exec(token)
    if (match) return Number(match[1] ?? match[2])
  }
  return 0
}

/** The strip's own type scale, and the only one it is allowed to carry. */
const STRIP_TEXT_SIZE_CLASS = 'text-[11px]'

/**
 * Any whole type-scale class: the named steps, and the arbitrary form with a
 * length in it. Sizes are asserted as a *set* equal to the one above rather
 * than by membership, because `text-sm` added beside `text-[11px]` wins in the
 * cascade while a `toContain` check stays green.
 *
 * `text-[color:...]` is a colour, not a size, and must not match here.
 */
const TEXT_SIZE_CLASS =
  /^text-(?:xs|sm|base|lg|xl|[2-9]xl|\[\d+(?:\.\d+)?(?:px|rem|em)\])$/

/**
 * Weight above the strip's `font-medium`. Loud has two halves, and this is the
 * half that needs no size change to get there: `font-semibold` alone turns a
 * label into a heading while every size assertion still passes.
 */
const LOUD_FONT_WEIGHT_CLASS = /^font-(?:semibold|bold|extrabold|black)$/

/**
 * Colour that shouts. `text-foreground` and `text-muted-foreground` are the
 * strip's two quiet tones; everything matched here is the palette a person
 * reaches for once they have decided something deserves attention — which, in
 * this strip, exactly one sentence has.
 */
const EMPHATIC_TEXT_COLOR_CLASS =
  /^text-(?:warning|destructive|primary|red|orange|amber|yellow|green|blue)(?:-|$)/

/** Every whole type-scale class on an element. */
function textSizeClasses(element: Element): string[] {
  return classTokens(element).filter((token) => TEXT_SIZE_CLASS.test(token))
}

/**
 * Every class in a subtree that raises the volume, optionally sparing one
 * element and its contents.
 *
 * The sweep reaches the leaves because the treatment lives on the spans, not
 * on the strip that holds them. It returns the offending classes rather than
 * asserting, so the failure names what did it.
 */
function loudClassesWithin(root: Element, except?: Element): string[] {
  return [root, ...Array.from(root.querySelectorAll('*'))]
    .filter((element) => !except?.contains(element))
    .flatMap((element) =>
      classTokens(element).filter(
        (token) =>
          LOUD_FONT_WEIGHT_CLASS.test(token) ||
          EMPHATIC_TEXT_COLOR_CLASS.test(token),
      ),
    )
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

const piProvider = {
  id: 'pi',
  name: 'Pi Agent',
  vendorLabel: 'Pi',
  kind: 'conversation' as const,
  supportsContinuation: true,
  defaultModelId: 'default',
  modelOptions: [
    {
      id: 'default',
      label: 'Pi default',
      defaultEffort: 'medium' as const,
      effortOptions: [
        { id: 'low' as const, label: 'Low' },
        { id: 'medium' as const, label: 'Medium' },
        { id: 'high' as const, label: 'High' },
      ],
    },
  ],
  attachments: {
    supportsImage: false,
    supportsPdf: false,
    supportsText: true,
    maxImageBytes: 0,
    maxPdfBytes: 0,
    maxTextBytes: 1024 * 1024,
    maxTotalBytes: 1024 * 1024,
  },
  midRunInput: {
    supportsAnswer: false,
    supportsNativeFollowUp: false,
    supportsAppQueuedFollowUp: true,
    supportsSteer: false,
    supportsInterrupt: true,
    defaultRunningMode: 'follow-up' as const,
  },
}

/**
 * The seeded catalog's descriptors, read back the way the app reads them.
 *
 * The store no longer holds a bare provider list — it holds one catalog per
 * machine — so a test that wants to vary a provider goes through the same
 * selector the surfaces do and reseeds this machine's catalog. Reaching past it
 * would let a fixture assert a shape the product cannot produce (MAR-2682).
 */
function seededProviders(): ProviderInfo[] {
  return selectLocalProviders(useSessionStore.getState())
}

/** Reseeds this machine's catalog with each descriptor rewritten. */
function reseedProviders(map: (provider: ProviderInfo) => ProviderInfo): void {
  useSessionStore.setState({
    providerCatalogs: localProviderCatalogs(seededProviders().map(map)),
  })
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
        piModelVisibility: { additionalModelIds: [] },
        // Endpoints are settings, and settings survive a render. Without this
        // reset, whether the strip is hidden depends on which test ran first.
        executionHostEndpoints: [],
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
      // A Local session works in the directory the record already names, so it
      // states no place and records none (MAR-2689).
      workAddress: null,
      providerAccountId: null,
    })
  })

  it('hides the execution bar when no endpoint is configured', () => {
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

    expect(screen.queryByText('Runs on')).not.toBeInTheDocument()
  })

  it('stacks the strip beneath the composer card instead of nesting it inside', () => {
    // The depth is structural, not decorative. The strip is a second surface
    // the composer card rests on; as a child of the card it could only ever be
    // one surface divided by a rule, which is the look this replaced. Every
    // class here would still read as plausible from inside the card, so the
    // load-bearing assertion is the nesting, not the styling.
    setEndpoints([endpointFixture('daemon-a', 'kuba-vps', 0)])

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

    const card = screen.getByTestId('composer-root')
    const strip = screen.getByTestId('execution-bar')

    expect(card.contains(strip)).toBe(false)
    expect(strip.parentElement).toBe(card.parentElement)
    expect(card.nextElementSibling).toBe(strip)

    // A later sibling paints over an earlier one, so "underneath" survives only
    // while the card explicitly claims the higher layer.
    expect(zIndexOf(card)).toBeGreaterThan(zIndexOf(strip))

    // A transparent strip is not a second surface; one that is not pulled up
    // behind the card is merely the next row down; one the card's corners do
    // not overhang is a band, not a layer; and a card with no shadow is not
    // resting on anything. Each is asserted as a whole class, because
    // `bg-transparent`, `-mt-0` and `mx-0` are exactly the mutations that carry
    // the prefix a looser matcher would have taken for the real thing.
    const stripTokens = classTokens(strip)
    expect(stripTokens).toContain('bg-sidebar')
    expect(spacingScale(strip, TUCK_CLASS)).toBeGreaterThan(0)
    expect(spacingScale(strip, INSET_CLASS)).toBeGreaterThan(0)
    expect(classTokens(card)).toContain('shadow-md')

    // The row separator is gone for good: it said "one surface, divided". The
    // whole family is forbidden, not the single class that was deleted — a top
    // edge drawn as `border-y`, or as a bare all-sides `border`, undoes the
    // stacking just as completely.
    expect(stripTokens.filter((token) => TOP_BORDER_CLASS.test(token))).toEqual(
      [],
    )
  })

  it('drops the card depth when there is no strip beneath it', () => {
    // No endpoints configured, so the strip does not render at all. A shadow is
    // a claim that something sits underneath, and with nothing under the card
    // it is a lie about the layout rather than a matter of taste.
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

    expect(screen.queryByTestId('execution-bar')).not.toBeInTheDocument()

    const card = screen.getByTestId('composer-root')
    expect(
      classTokens(card).filter((token) => SHADOW_CLASS.test(token)),
    ).toEqual([])
    expect(zIndexOf(card)).toBe(0)
  })

  it('attaches a file dropped on the strip', async () => {
    // The strip is a sibling of the card, so drag handlers on the card alone
    // leave the visible band inert: a file dropped on it lands on nothing.
    // Restructuring for layering also moves elements out of behavioural
    // boundaries — one DOM tree carries both — so the drop target is the
    // surface group around the two layers, not the card.
    setEndpoints([endpointFixture('daemon-a', 'kuba-vps', 0)])

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

    fireEvent.drop(screen.getByTestId('execution-bar'), {
      dataTransfer: {
        files: [
          new File([new Uint8Array([1, 2, 3])], 'shot.png', {
            type: 'image/png',
          }),
        ],
      },
    })

    const ingestFiles = useAttachmentStore.getState().ingestFiles as ReturnType<
      typeof vi.fn
    >
    await waitFor(() => {
      expect(ingestFiles).toHaveBeenCalledTimes(1)
    })
    expect(ingestFiles.mock.calls[0][1]).toMatchObject([
      { name: 'shot.png', mimeType: 'image/png' },
    ])
  })

  it('starts the session on the endpoint he picked in the strip', async () => {
    // Two endpoints on purpose: the killed boolean resolved to whichever came
    // first, so a green single-endpoint test would prove nothing about which
    // machine the strip actually names.
    setEndpoints([
      endpointFixture('daemon-a', 'kuba-vps', 0),
      endpointFixture('daemon-b', 'backpack-automations', 1),
    ])
    // daemon-b's own catalog, with a model slug this machine does not have.
    // The send below reads back that slug, so this also proves the row obeyed
    // the strip rather than resolving against the local registry (MAR-2682).
    seedCatalog('daemon-b', [
      {
        descriptor: remoteProvider('claude-code', 'Claude Code', [
          { id: 'sonnet', label: 'Claude Sonnet' },
        ]),
        blockedReason: null,
      },
    ])
    seedRemoteProjects('daemon-b', [REMOTE_PROJECT])

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

    expect(screen.getByText('Runs on')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('combobox', { name: /Local/ }))
    fireEvent.click(screen.getByText('backpack-automations'))

    // The place is stated before the send, and this is that statement: until
    // the strip can say where the session works, there is nothing for the send
    // to carry (MAR-2689).
    expect(await screen.findByText('Works in')).toBeInTheDocument()

    const textbox = screen.getByRole('textbox')
    fireEvent.change(textbox, { target: { value: 'Run remotely' } })
    fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

    expect(
      useSessionStore.getState().createAndStartSession,
    ).toHaveBeenCalledWith({
      projectId: 'project-1',
      workspaceId: null,
      providerId: 'claude-code',
      // daemon-b's slug, not this machine's `claude-sonnet`.
      model: 'sonnet',
      effort: null,
      name: 'Run remotely',
      message: 'Run remotely',
      attachmentIds: undefined,
      skillSelections: undefined,
      contextItemIds: undefined,
      // A session born on a daemon is unattended by definition: he is not
      // there to click allow (MAR-2689).
      permissionConfig: { preset: 'yolo' },
      serviceTier: null,
      // Which machine, not whether, and not merely "the first one".
      executionHost: 'daemon-b',
      // And where *on* that machine: the Project holding this project's own
      // repository, matched by origin and stated on the strip before send.
      workAddress: {
        mode: 'project',
        projectId: 'new-blok',
        workingDirectory: '/srv/projects/new-blok',
        label: 'Project new-blok',
      },
      providerAccountId: null,
    })
  })

  it('demotes the send to this machine when the picked endpoint is removed', () => {
    // One endpoint survives on purpose, so the strip stays a chooser and the
    // clamp is the load-bearing step. Removing every endpoint would hide the
    // strip instead, and prove the hidden path rather than this one.
    setEndpoints([
      endpointFixture('daemon-a', 'kuba-vps', 0),
      endpointFixture('daemon-b', 'backpack-automations', 1),
    ])

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

    fireEvent.click(screen.getByRole('combobox', { name: /Local/ }))
    fireEvent.click(screen.getByText('backpack-automations'))
    expect(
      screen.getByRole('combobox', { name: /backpack-automations/ }),
    ).toBeInTheDocument()

    setEndpoints([endpointFixture('daemon-a', 'kuba-vps', 0)])
    expect(screen.getByRole('combobox', { name: /Local/ })).toBeInTheDocument()

    const textbox = screen.getByRole('textbox')
    fireEvent.change(textbox, { target: { value: 'Run it' } })
    fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

    expect(
      useSessionStore.getState().createAndStartSession,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ executionHost: undefined }),
    )
  })

  it('states the machine of a live session instead of offering a choice', () => {
    // Per session: the daemon owns a running session, so the machine cannot
    // change under it and a control that implied otherwise would lie.
    setEndpoints([endpointFixture('daemon-a', 'kuba-vps', 0)])
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

    expect(screen.getByText('Runs on')).toBeInTheDocument()
    expect(screen.getByText('kuba-vps')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /kuba-vps/ })).toBeNull()
  })

  it('names the endpoint a live session can no longer reach, id and all', () => {
    // The rendered half of the rule. A bare "Removed endpoint" cannot say
    // WHICH machine this session named, and once two are removed every one of
    // their sessions reads the same. One endpoint survives on purpose, so a
    // lookup that answered from the wrong row would have something plausible
    // to answer with.
    setEndpoints([endpointFixture('daemon-a', 'kuba-vps', 0)])
    useSessionStore.setState((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === 'session-1'
          ? { ...session, executionHost: 'daemon-b' }
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

    expect(screen.getByText('Removed endpoint (daemon-b)')).toBeInTheDocument()
    expect(
      screen.getByText(
        'This session names "daemon-b", an endpoint that is no longer ' +
          'configured, so it will refuse to run.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('kuba-vps')).toBeNull()
  })

  it('hides the strip in a global chat, endpoints configured or not', () => {
    // A global session has no repository to clone, so every remote row would
    // be unpickable and the chooser would be the empty promise the
    // constitution forbids. Endpoints are configured on purpose: with none,
    // the "no endpoints" rule hides the strip anyway and this would prove
    // nothing about the context it was given.
    setEndpoints([endpointFixture('daemon-a', 'kuba-vps', 0)])

    render(
      <ComposerContainer context={{ kind: 'global', activeSessionId: null }} />,
    )

    expect(screen.queryByText('Runs on')).toBeNull()
  })

  it('lists whatever the machine he picked says it runs, and nothing local', async () => {
    // The contradiction MAR-2682 closes: the strip named a daemon while the row
    // above it went on offering every CLI installed here. Pi is on this machine
    // and not on that one, so it must be gone the moment the strip moves --
    // and the daemon's own model slug must be what the row shows.
    setEndpoints([endpointFixture('daemon-a', 'kuba-vps', 0)])
    useSessionStore.setState({
      providerCatalogs: localProviderCatalogs([
        ...seededProviders(),
        piProvider,
      ]),
    })
    seedCatalog('daemon-a', [
      {
        descriptor: remoteProvider('claude-code', 'Claude Code', [
          { id: 'sonnet', label: 'Daemon Sonnet' },
        ]),
        blockedReason: null,
      },
    ])

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
      screen.getByRole('combobox', { name: 'Anthropic' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('combobox', { name: /Local/ }))
    fireEvent.click(screen.getByText('kuba-vps'))

    // The local-only provider is gone, and the model pill reads the daemon's.
    await waitFor(() => {
      expect(
        screen.getByRole('combobox', { name: 'Remote daemon' }),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByRole('combobox', { name: 'Daemon Sonnet' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('combobox', { name: 'Remote daemon' }))
    expect(
      await screen.findByRole('option', { name: /Claude Code/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Pi/ })).toBeNull()
  })

  it('offers every endpoint whatever provider is selected, because nothing local knows', async () => {
    // MAR-2682, "nothing local may assert a remote fact": the strip used to
    // block rows from a local table of
    // "remote-capable" providers that had never asked any daemon. That arrow is
    // reversed -- the machine is picked first, and the row obeys -- so choosing
    // Pi may not remove a machine he configured.
    setEndpoints([endpointFixture('daemon-a', 'kuba-vps', 0)])
    useSessionStore.setState({
      providerCatalogs: localProviderCatalogs([
        ...seededProviders(),
        piProvider,
      ]),
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

    fireEvent.click(screen.getByRole('combobox', { name: 'Anthropic' }))
    fireEvent.click(await screen.findByText('Pi'))

    fireEvent.click(screen.getByRole('combobox', { name: /Local/ }))
    const row = screen.getByRole('option', { name: /kuba-vps/ })
    expect(row).not.toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(row)
    await waitFor(() => {
      expect(
        screen.getByRole('combobox', { name: /kuba-vps/ }),
      ).toBeInTheDocument()
    })
  })
  describe("the strip's second slot: where the session works (MAR-2689)", () => {
    function renderNewSession() {
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
    }

    async function pickMachine(label: string): Promise<void> {
      fireEvent.click(await screen.findByRole('combobox', { name: /Local/ }))
      fireEvent.click(screen.getByText(label))
    }

    it('does not exist on Local, so a Local composer is unchanged', async () => {
      setEndpoints([endpointFixture('daemon-a', 'kuba-vps', 0)])
      renderNewSession()

      // The machine tier is there, and only it. Anything else on this strip
      // would be a change to a composer that must not change (MAR-2682).
      expect(await screen.findByText('Runs on')).toBeInTheDocument()
      expect(screen.queryByText('Works in')).toBeNull()
      expect(screen.queryByTestId('work-address-notice')).toBeNull()
      // The branch field is part of the second slot and shares its absence
      // (MAR-2694). Mutation: render it outside the slot and this goes red.
      expect(screen.queryByTestId('work-address-branch-input')).toBeNull()
    })

    it('lists the machine Projects and preselects the one holding this repository', async () => {
      setEndpoints([endpointFixture('daemon-a', 'little-monster', 0)])
      seedCatalog('daemon-a', [
        {
          descriptor: remoteProvider('claude-code', 'Claude Code', [
            { id: 'sonnet', label: 'Claude Sonnet' },
          ]),
          blockedReason: null,
        },
      ])
      seedRemoteProjects('daemon-a', [
        { ...REMOTE_PROJECT, id: 'segmemo', name: 'segmemo', origin: null },
        REMOTE_PROJECT,
      ])
      renderNewSession()
      await pickMachine('little-monster')

      const slot = await screen.findByRole('combobox', {
        name: /Project new-blok/,
      })
      expect(slot).toBeInTheDocument()

      fireEvent.click(slot)
      expect(screen.getByText('Project segmemo')).toBeInTheDocument()
      expect(screen.getByText('marckraw/new-blok')).toBeInTheDocument()
    })

    it('offers only the repository on a machine that does no Projects', async () => {
      setEndpoints([endpointFixture('daemon-a', 'little-monster', 0)])
      seedCatalog('daemon-a', [
        {
          descriptor: remoteProvider('claude-code', 'Claude Code', [
            { id: 'sonnet', label: 'Claude Sonnet' },
          ]),
          blockedReason: null,
        },
      ])
      seedRemoteProjects('daemon-a', [], { supported: false })
      renderNewSession()
      await pickMachine('little-monster')

      expect(
        await screen.findByRole('combobox', { name: /marckraw\/new-blok/ }),
      ).toBeInTheDocument()
      // No Projects is a listing, not a fault, so nothing is explained away.
      expect(screen.queryByTestId('work-address-notice')).toBeNull()
    })

    it('survives a bridge that cannot answer what a daemon would clone', async () => {
      // A door this composer merely reads from must never be able to take it
      // down. A method that is not there throws where it is *called* --
      // synchronously, out of the effect -- so a trailing `.catch` would not
      // see it and the whole composer would unmount (MAR-2689).
      const electronAPI = (
        window as unknown as { electronAPI: { git: Record<string, unknown> } }
      ).electronAPI
      delete electronAPI.git.getCloneableRepositoryUrl

      setEndpoints([endpointFixture('daemon-a', 'little-monster', 0)])
      seedCatalog('daemon-a', [
        {
          descriptor: remoteProvider('claude-code', 'Claude Code', [
            { id: 'sonnet', label: 'Claude Sonnet' },
          ]),
          blockedReason: null,
        },
      ])
      seedRemoteProjects('daemon-a', [], { supported: false })
      renderNewSession()
      await pickMachine('little-monster')

      // The strip is still there, and it says it has nothing to offer rather
      // than offering a place derived from nothing.
      expect(
        await screen.findByTestId('work-address-notice'),
      ).toHaveTextContent(/no GitHub origin/)
      expect(screen.getByText('Runs on')).toBeInTheDocument()
    })

    it('says it is asking while the machine has not answered', async () => {
      setEndpoints([endpointFixture('daemon-a', 'little-monster', 0)])
      seedCatalog('daemon-a', [
        {
          descriptor: remoteProvider('claude-code', 'Claude Code', [
            { id: 'sonnet', label: 'Claude Sonnet' },
          ]),
          blockedReason: null,
        },
      ])
      renderNewSession()
      await pickMachine('little-monster')

      expect(
        await screen.findByTestId('work-address-notice'),
      ).toHaveTextContent(/Asking little-monster where it can work/)
    })

    it('will not start a session while the machine has not said where it can work', async () => {
      // The incident, reached through the new control: pick a daemon, press
      // ⌘↵ while the strip still says "Asking…", and the session was created
      // with `unknown` on the record — after which the start fell back to the
      // silent derivation and cloned whatever the session's own project points
      // at (MAR-2689). ⌘↵ and not the button, because the shortcut is the path
      // he actually uses and the one that had its own copy of the rule.
      //
      // Mutation: drop `workAddressReadyForSend(workAddress)` from `canSend`
      // in the presentational, and both assertions go red.
      const electronAPI = (
        window as unknown as {
          electronAPI: { executionHost: Record<string, unknown> }
        }
      ).electronAPI
      // A read that never lands: the machine has been asked and has not
      // answered, which is exactly the window the send used to slip through.
      electronAPI.executionHost.getProjects = vi.fn(() => new Promise(() => {}))

      setEndpoints([endpointFixture('daemon-a', 'little-monster', 0)])
      seedCatalog('daemon-a', [
        {
          descriptor: remoteProvider('claude-code', 'Claude Code', [
            { id: 'sonnet', label: 'Claude Sonnet' },
          ]),
          blockedReason: null,
        },
      ])
      renderNewSession()
      await pickMachine('little-monster')

      expect(
        await screen.findByTestId('work-address-notice'),
      ).toHaveTextContent(/Asking little-monster where it can work/)

      const textbox = screen.getByRole('textbox')
      fireEvent.change(textbox, { target: { value: 'Run remotely' } })
      fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

      expect(
        useSessionStore.getState().createAndStartSession,
      ).not.toHaveBeenCalled()
      expect(
        screen.getByRole('button', { name: 'Send message' }),
      ).toBeDisabled()
    })

    it('asks git nothing at all for a Local composer', async () => {
      // Ruling 2 says the slot does not exist on Local; the cost must not
      // exist either. The origin read used to run for every composer with a
      // project, spawning `git config` in the main process for a session that
      // has no slot to fill — so "Local is byte-identical" was true of the
      // rendered DOM and of nothing else (MAR-2682).
      //
      // Mutation: drop the `needsCloneableRepository` guard on the origin
      // effect, and this goes red.
      setEndpoints([endpointFixture('daemon-a', 'little-monster', 0)])
      renderNewSession()

      expect(await screen.findByText('Runs on')).toBeInTheDocument()
      const textbox = screen.getByRole('textbox')
      fireEvent.change(textbox, { target: { value: 'A local run' } })
      fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

      await waitFor(() =>
        expect(
          useSessionStore.getState().createAndStartSession,
        ).toHaveBeenCalled(),
      )
      // The real renderer seam, not the module: a spy on the api wrapper would
      // stay green if the container started calling the bridge directly.
      expect(
        window.electronAPI.git.getCloneableRepositoryUrl,
      ).not.toHaveBeenCalled()
    })

    /**
     * The branch, written and never derived (MAR-2694). The strip has to say
     * which of the two things is about to happen, and they are different
     * things: an empty field means the daemon names the branch, and a typed one
     * means this branch and no other.
     *
     * Mutation: swap the two labels in `describeBranchToBeCut` and this goes
     * red on both rows -- a strip that says a branch was chosen when nothing
     * was written is the kind of quiet lie MAR-2619 forbids.
     */
    it('says the daemon names the branch until one is written down', async () => {
      setEndpoints([endpointFixture('daemon-a', 'little-monster', 0)])
      seedCatalog('daemon-a', [
        {
          descriptor: remoteProvider('claude-code', 'Claude Code', [
            { id: 'sonnet', label: 'Claude Sonnet' },
          ]),
          blockedReason: null,
        },
      ])
      seedRemoteProjects('daemon-a', [], { supported: false })
      renderNewSession()
      await pickMachine('little-monster')

      const field = await screen.findByTestId('work-address-branch-input')
      expect(
        screen.getByTestId('work-address-branch-statement'),
      ).toHaveTextContent('branch: daemon-named')

      fireEvent.change(field, { target: { value: 'agent/mar-2694' } })
      expect(
        await screen.findByTestId('work-address-branch-statement'),
      ).toHaveTextContent('@ agent/mar-2694')
    })

    /**
     * A residency runs on the checkout's own HEAD, so there is nothing to
     * write and no field to write it in.
     *
     * Mutation: render the field for every mode and this goes red.
     */
    it('offers no branch field for a Project on the machine', async () => {
      setEndpoints([endpointFixture('daemon-a', 'little-monster', 0)])
      seedCatalog('daemon-a', [
        {
          descriptor: remoteProvider('claude-code', 'Claude Code', [
            { id: 'sonnet', label: 'Claude Sonnet' },
          ]),
          blockedReason: null,
        },
      ])
      seedRemoteProjects('daemon-a', [REMOTE_PROJECT])
      renderNewSession()
      await pickMachine('little-monster')

      expect(
        await screen.findByRole('combobox', { name: /Project new-blok/ }),
      ).toBeInTheDocument()
      expect(screen.queryByTestId('work-address-branch-input')).toBeNull()
    })

    /**
     * The branch reaches the record exactly as typed, through the real send
     * path -- not trimmed, not slugified, not derived from anything.
     *
     * Mutation: trim the draft in `branchNameFromDraft` and this goes red.
     */
    it('sends the branch verbatim with the place', async () => {
      setEndpoints([endpointFixture('daemon-a', 'little-monster', 0)])
      seedCatalog('daemon-a', [
        {
          descriptor: remoteProvider('claude-code', 'Claude Code', [
            { id: 'sonnet', label: 'Claude Sonnet' },
          ]),
          blockedReason: null,
        },
      ])
      seedRemoteProjects('daemon-a', [], { supported: false })
      renderNewSession()
      await pickMachine('little-monster')

      fireEvent.change(await screen.findByTestId('work-address-branch-input'), {
        target: { value: 'agent/mar-2694 ' },
      })
      const textbox = screen.getByRole('textbox', { name: 'Message' })
      fireEvent.change(textbox, { target: { value: 'An errand' } })
      fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })

      await waitFor(() =>
        expect(
          useSessionStore.getState().createAndStartSession,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            workAddress: {
              mode: 'repository',
              repository: 'https://github.com/marckraw/new-blok.git',
              branchName: 'agent/mar-2694 ',
              label: 'marckraw/new-blok',
            },
          }),
        ),
      )
    })

    /**
     * Once the daemon has answered, the strip reads its branch and not the one
     * that was asked for -- and when the two differ it says so rather than
     * quietly showing one (MAR-2694).
     *
     * Mutation: prefer the address's `branchName` over the reported one in
     * `statedWorkPlace` and this goes red on both assertions.
     */
    it('states the branch the daemon cut, and what was asked for when they differ', async () => {
      setEndpoints([endpointFixture('daemon-a', 'little-monster', 0)])
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === 'session-1'
            ? {
                ...session,
                executionHost: 'daemon-a',
                workAddress: {
                  mode: 'repository' as const,
                  repository: 'https://github.com/marckraw/new-blok.git',
                  branchName: 'agent/mar-2694',
                  label: 'marckraw/new-blok',
                },
                reportedWorkspace: {
                  mode: 'repository' as const,
                  repository: 'https://github.com/marckraw/new-blok.git',
                  branchName: 'agent/34372e47',
                  baseRef: 'master',
                  workspacePath: '/srv/worktrees/s-1',
                  environment: null,
                },
              }
            : session,
        ),
      }))
      seedCatalog('daemon-a', [
        {
          descriptor: remoteProvider('claude-code', 'Claude Code', [
            { id: 'sonnet', label: 'Claude Sonnet' },
          ]),
          blockedReason: null,
        },
      ])

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

      expect(await screen.findByTestId('work-address-fact')).toHaveTextContent(
        'marckraw/new-blok @ agent/34372e47',
      )
      expect(
        screen.getByTestId('work-address-requested-branch'),
      ).toHaveTextContent('requested agent/mar-2694')
    })

    it('states a live remote session place from its record', async () => {
      setEndpoints([endpointFixture('daemon-a', 'little-monster', 0)])
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === 'session-1'
            ? {
                ...session,
                executionHost: 'daemon-a',
                workAddress: {
                  mode: 'project' as const,
                  projectId: 'new-blok',
                  workingDirectory: '/srv/projects/new-blok',
                  label: 'Project new-blok',
                },
              }
            : session,
        ),
      }))
      seedCatalog('daemon-a', [
        {
          descriptor: remoteProvider('claude-code', 'Claude Code', [
            { id: 'sonnet', label: 'Claude Sonnet' },
          ]),
          blockedReason: null,
        },
      ])

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

      // A statement of fact, not a control: the daemon owns a running session
      // and its place cannot change under it.
      expect(await screen.findByTestId('work-address-fact')).toHaveTextContent(
        'Project new-blok',
      )
      expect(
        screen.queryByRole('combobox', { name: /Project new-blok/ }),
      ).toBeNull()
    })

    it('says Unknown for a remote session started before places were recorded', async () => {
      setEndpoints([endpointFixture('daemon-a', 'little-monster', 0)])
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === 'session-1'
            ? {
                ...session,
                executionHost: 'daemon-a',
                workAddress: { mode: 'unknown' as const },
              }
            : session,
        ),
      }))
      seedCatalog('daemon-a', [
        {
          descriptor: remoteProvider('claude-code', 'Claude Code', [
            { id: 'sonnet', label: 'Claude Sonnet' },
          ]),
          blockedReason: null,
        },
      ])

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

      expect(await screen.findByTestId('work-address-fact')).toHaveTextContent(
        'Unknown',
      )
    })
  })

  describe('the permission preset a machine implies (MAR-2689)', () => {
    function renderNewSession() {
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
    }

    /** The preset control names its own value, so the value is what is read. */
    function presetShows(label: 'Ask' | 'Yolo'): boolean {
      return screen.queryByRole('combobox', { name: label }) !== null
    }

    it('opens Ask on Local and Yolo once a daemon is named', async () => {
      setEndpoints([endpointFixture('daemon-a', 'little-monster', 0)])
      seedCatalog('daemon-a', [
        {
          descriptor: remoteProvider('claude-code', 'Claude Code', [
            { id: 'sonnet', label: 'Claude Sonnet' },
          ]),
          blockedReason: null,
        },
      ])
      seedRemoteProjects('daemon-a', [REMOTE_PROJECT])
      renderNewSession()

      expect(presetShows('Ask')).toBe(true)

      fireEvent.click(await screen.findByRole('combobox', { name: /Local/ }))
      fireEvent.click(screen.getByText('little-monster'))

      await waitFor(() => expect(presetShows('Yolo')).toBe(true))
      expect(presetShows('Ask')).toBe(false)
    })

    it('leaves a preset he touched alone across a machine switch', async () => {
      // Two daemons, because the discriminating switch is remote -> remote: a
      // machine the default would answer `yolo` for. Switching from Local would
      // land on `yolo` whether his touch was honoured or not.
      setEndpoints([
        endpointFixture('daemon-a', 'little-monster', 0),
        endpointFixture('daemon-b', 'kuba-vps', 1),
      ])
      for (const id of ['daemon-a', 'daemon-b']) {
        seedCatalog(id, [
          {
            descriptor: remoteProvider('claude-code', 'Claude Code', [
              { id: 'sonnet', label: 'Claude Sonnet' },
            ]),
            blockedReason: null,
          },
        ])
        seedRemoteProjects(id, [REMOTE_PROJECT])
      }
      renderNewSession()

      fireEvent.click(await screen.findByRole('combobox', { name: /Local/ }))
      fireEvent.click(screen.getByText('little-monster'))
      await waitFor(() => expect(presetShows('Yolo')).toBe(true))

      // He decides for himself that this run should ask.
      fireEvent.click(screen.getByRole('combobox', { name: 'Yolo' }))
      fireEvent.click(screen.getByText('Ask'))
      expect(presetShows('Ask')).toBe(true)

      fireEvent.click(screen.getByRole('combobox', { name: /little-monster/ }))
      fireEvent.click(screen.getByText('kuba-vps'))

      // A default that undid a deliberate choice would be the control below
      // the strip disagreeing with the human above it.
      await waitFor(() =>
        expect(screen.getByText('Works in')).toBeInTheDocument(),
      )
      expect(presetShows('Ask')).toBe(true)
    })
  })

  describe('the quiet type treatment, ruled "lets do quiet until i look" (Marcin, 2026-08-27, MAR-2642)', () => {
    // A deliberate absence of emphasis needs enforcing, not a note. Nothing
    // else in this file touches a type scale or a text tone, so a strip
    // loudened to headline weight passes every other test here — the comment
    // in execution-bar.styles.ts explains why this is quiet, and these two
    // tests are what make that comment true.
    //
    // Fable asked whether the machine name should carry more presence than the
    // model name in the row above, given that it governs everything above it.
    // The answer is quoted in the title, verbatim. A red here is a
    // contradiction of that ruling, not a typo to fix: take it back to Marcin.

    it('keeps the label and the chooser at the strip scale and tone', () => {
      setEndpoints([endpointFixture('daemon-a', 'kuba-vps', 0)])

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

      const label = screen.getByText('Runs on')
      expect(textSizeClasses(label)).toEqual([STRIP_TEXT_SIZE_CLASS])
      expect(classTokens(label)).toContain('text-muted-foreground')

      // Asserted on the rendered trigger rather than the exported constant:
      // the Button brings `text-sm` and `text-xs` of its own, and what the
      // strip is ruled to be is whatever survives that merge onto the element.
      const chooser = screen.getByRole('combobox', { name: /Local/ })
      expect(textSizeClasses(chooser)).toEqual([STRIP_TEXT_SIZE_CLASS])
      expect(classTokens(chooser)).toContain('text-muted-foreground')

      // No session is live, so nothing in here could have earned emphasis.
      expect(loudClassesWithin(screen.getByTestId('execution-bar'))).toEqual([])
    })

    it('states the machine quietly and lets only the refusal be loud', () => {
      // The removed-endpoint state on purpose: it is the one moment the strip
      // holds both readings at once — a machine that is context, and a
      // sentence that is a live signal — so the exception can be pinned as an
      // exception rather than as the only thing on screen.
      setEndpoints([endpointFixture('daemon-a', 'kuba-vps', 0)])
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === 'session-1'
            ? { ...session, executionHost: 'daemon-b' }
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

      const label = screen.getByText('Runs on')
      expect(textSizeClasses(label)).toEqual([STRIP_TEXT_SIZE_CLASS])
      expect(classTokens(label)).toContain('text-muted-foreground')

      // The machine governs every turn above it and is still 11px. That is the
      // reading that was heard and declined, held in place.
      const fact = screen.getByText('Removed endpoint (daemon-b)')
      expect(textSizeClasses(fact)).toEqual([STRIP_TEXT_SIZE_CLASS])

      // The one exception, and an exception in colour alone: a session that
      // will refuse to run is a live signal, not context.
      const warning = screen.getByText(
        'This session names "daemon-b", an endpoint that is no longer ' +
          'configured, so it will refuse to run.',
      )
      expect(classTokens(warning)).toContain('text-warning-foreground')
      expect(textSizeClasses(warning)).toEqual([STRIP_TEXT_SIZE_CLASS])

      // ...and nothing else in the strip gets to shout alongside it.
      expect(
        loudClassesWithin(screen.getByTestId('execution-bar'), warning),
      ).toEqual([])
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
    useSessionStore.setState({
      providerCatalogs: localProviderCatalogs([codexProvider]),
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
      // A Local session works in the directory the record already names, so it
      // states no place and records none (MAR-2689).
      workAddress: null,
      providerAccountId: null,
    })
  })

  it('can turn on fast mode for a new Codex session', () => {
    useSessionStore.setState({
      providerCatalogs: localProviderCatalogs([codexProvider]),
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
      // A Local session works in the directory the record already names, so it
      // states no place and records none (MAR-2689).
      workAddress: null,
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
      // A Local session works in the directory the record already names, so it
      // states no place and records none (MAR-2689).
      workAddress: null,
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

  it('reloads the catalog when Pi model visibility changes while mounted', async () => {
    const loadProviderCatalog = useSessionStore.getState().loadProviderCatalog

    render(
      <ComposerContainer
        context={{
          kind: 'global',
          activeSessionId: null,
        }}
      />,
    )

    await waitFor(() => expect(loadProviderCatalog).toHaveBeenCalledTimes(1))

    act(() => {
      useAppSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          piModelVisibility: { additionalModelIds: ['openai/gpt-5.5'] },
        },
      }))
    })

    await waitFor(() => expect(loadProviderCatalog).toHaveBeenCalledTimes(2))
  })

  it('shows Codex usage in the composer for Codex provider selections', async () => {
    const baseProvider = seededProviders()[0]
    if (!baseProvider) throw new Error('missing base test provider')

    useSessionStore.setState({
      providerCatalogs: localProviderCatalogs([
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
      ]),
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
    const baseProvider = seededProviders()[0]
    if (!baseProvider) throw new Error('missing base test provider')

    useSessionStore.setState({
      providerCatalogs: localProviderCatalogs([
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
      ]),
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
    }))
    reseedProviders((provider) =>
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
    )

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
    }))
    reseedProviders((provider) =>
      provider.id === 'claude-code'
        ? {
            ...provider,
            midRunInput: {
              ...provider.midRunInput,
              supportsAnswer: true,
            },
          }
        : provider,
    )

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

    it('shows no account picker at all on a remote session', async () => {
      // Accounts are host-scoped (PA10) and on a daemon the concept is absent,
      // not merely locked: the wire protocol carries no account reference, so
      // there is nothing to pick between. It is gone rather than explained --
      // MAR-2682, "the account picker is gone on a remote" -- and gone
      // because it is handed no accounts, which
      // is the only way it can be gone for the right reason.
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
      seedCatalog('daemon-a', [
        {
          descriptor: remoteProvider('claude-code', 'Claude Code', [
            { id: 'sonnet', label: 'Daemon Sonnet' },
          ]),
          blockedReason: null,
        },
      ])

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

      // The strip still says where it runs, so the composer has rendered.
      expect(await screen.findByText('Runs on')).toBeInTheDocument()
      expect(screen.queryByText('b@example.com')).not.toBeInTheDocument()
      expect(screen.queryByText(/Default account/)).toBeNull()
      // And a Local session in the same file still has one — the control did
      // not simply stop existing.
      expect(screen.queryByRole('combobox', { name: /account/i })).toBeNull()
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
      seedCatalog('daemon-a', [
        {
          descriptor: remoteProvider('claude-code', 'Claude Code', [
            { id: 'sonnet', label: 'Daemon Sonnet' },
          ]),
          blockedReason: null,
        },
      ])

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

      await screen.findByText('Runs on')

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
      reseedProviders((provider) =>
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
      )
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
      useSessionStore.setState({ setSessionModelSelection })
      reseedProviders((provider) => ({
        ...provider,
        id: 'shell',
        name: 'Shell',
        vendorLabel: 'Local',
        supportsContinuation: false,
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
        useSessionStore.setState({
          providerCatalogs: localProviderCatalogs([codexProvider]),
        })
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
        useSessionStore.setState({
          providerCatalogs: localProviderCatalogs([
            ...seededProviders(),
            codexProvider,
          ]),
        })
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
