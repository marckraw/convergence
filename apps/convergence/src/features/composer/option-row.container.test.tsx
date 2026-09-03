import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ComposerContainer } from './composer.container'
import { useSessionStore, type ProviderInfo } from '@/entities/session'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useSessionRelayStore } from '@/entities/session-relay'
import { useSkillStore } from '@/entities/skill'
import { useProjectContextStore } from '@/entities/project-context'
import { normalizeProjectSettings, useProjectStore } from '@/entities/project'

/**
 * The option row obeys the strip (MAR-2682, S3 of MAR-2619).
 *
 * Every check here runs the whole path — `window.electronAPI.provider.getAll`
 * to the store to the container to the rendered row — and never seeds the store
 * with a catalog. That is deliberate and it is the point: six findings in this
 * era were wires that could be mutated with every gate still green, because the
 * gates asserted the pieces rather than the composition. A test that filed a
 * catalog directly into the store would prove the row can render one; it could
 * not prove the row *asks the machine the strip names*, which is the whole
 * claim. The mutation this file is built to catch is the container reading the
 * local catalog for a remote host, and only a test that owns the IPC seam can
 * see the difference.
 *
 * Rulings are cited here by name, never by number. The kickoff brief and the
 * Linear ticket number the same rulings differently, so a numbered citation is
 * a reference to whichever document the reader happens to open — two documents
 * that can drift, and did. A name cannot.
 */

const LOCAL_PROVIDERS: ProviderInfo[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendorLabel: 'Anthropic',
    kind: 'conversation' as const,
    supportsContinuation: true,
    defaultModelId: 'claude-sonnet-4-5',
    modelOptions: [
      {
        id: 'claude-sonnet-4-5',
        label: 'Claude Sonnet 4.5',
        defaultEffort: 'medium' as const,
        effortOptions: [
          { id: 'low' as const, label: 'Low' },
          { id: 'medium' as const, label: 'Medium' },
        ],
      },
    ],
    attachments: {
      supportsImage: true,
      supportsPdf: true,
      supportsText: true,
      maxImageBytes: 1024,
      maxPdfBytes: 1024,
      maxTextBytes: 1024,
      maxTotalBytes: 4096,
    },
    midRunInput: {
      supportsAnswer: false,
      supportsNativeFollowUp: false,
      supportsAppQueuedFollowUp: true,
      supportsSteer: false,
      supportsInterrupt: true,
      defaultRunningMode: 'follow-up' as const,
    },
  },
  {
    id: 'pi',
    name: 'Pi Agent',
    vendorLabel: 'Pi',
    kind: 'conversation' as const,
    supportsContinuation: true,
    defaultModelId: 'pi-default',
    modelOptions: [
      {
        id: 'pi-default',
        label: 'Pi default',
        defaultEffort: null,
        effortOptions: [],
      },
    ],
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
      supportsNativeFollowUp: false,
      supportsAppQueuedFollowUp: true,
      supportsSteer: false,
      supportsInterrupt: true,
      defaultRunningMode: 'follow-up' as const,
    },
  },
]

function daemonProvider(
  id: string,
  name: string,
  models: { id: string; label: string }[],
): ProviderInfo {
  return {
    id,
    name,
    // Blank, as the wire descriptor now is: the row's primary label falls back
    // to the provider's own name, and naming the machine is the strip's job.
    vendorLabel: '',
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

function entries(
  providers: readonly ProviderInfo[],
  blocked: Record<string, string> = {},
) {
  return providers.map((descriptor) => ({
    descriptor,
    blockedReason: blocked[descriptor.id] ?? null,
  }))
}

/** What each machine answers, keyed by the machine that is asked. */
let catalogsByHost: Record<
  string,
  { providers: ReturnType<typeof entries>; unreachableReason: string | null }
> = {}
/** Machines that never answer, so the row is left asking. */
let hangingHosts = new Set<string>()
/**
 * Machines whose answer the test releases by hand, in order.
 *
 * The only way to be standing inside the window this slice is about: a catalog
 * in flight for the address an Endpoint has just been edited away from.
 */
let deferredHosts = new Set<string>()
let deferred: Array<{ hostId: string; settle: (catalog: unknown) => void }> = []

function endpoint(
  id: string,
  label: string,
  baseUrl: string,
  position = 0,
  configurationEpoch = 0,
) {
  return {
    id,
    label,
    baseUrl,
    position,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    configurationEpoch,
  }
}

function setEndpoints(endpoints: ReturnType<typeof endpoint>[]): void {
  act(() => {
    useAppSettingsStore.setState((state) => ({
      settings: { ...state.settings, executionHostEndpoints: endpoints },
    }))
  })
}

/**
 * A live session on a named machine, so the strip states where the session runs
 * rather than offering a choice -- the one path an execution host id reaches
 * the row from a *record* instead of from a picker.
 */
function seedLiveSession(executionHost: string): void {
  act(() => {
    useSessionStore.setState({
      sessions: [
        {
          id: 'session-1',
          contextKind: 'project',
          projectId: 'project-1',
          workspaceId: null,
          providerId: 'claude-code',
          model: 'claude-sonnet-4-5',
          effort: 'medium',
          name: 'live session',
          status: 'idle',
          attention: 'none',
          activity: null,
          contextWindow: null,
          workingDirectory: '/tmp/project-1',
          archivedAt: null,
          parentSessionId: null,
          forkStrategy: null,
          primarySurface: 'conversation',
          continuationToken: null,
          lastSequence: 0,
          executionHost,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
  })
}

function renderComposer(activeSessionId: string | null = null) {
  return render(
    <ComposerContainer
      context={{
        kind: 'project',
        projectId: 'project-1',
        workspaceId: null,
        activeSessionId,
      }}
    />,
  )
}

/** Every machine the renderer has asked about, in order, exactly as sent. */
function getAllCalls(): unknown[] {
  const getAll = (
    window as unknown as {
      electronAPI: { provider: { getAll: ReturnType<typeof vi.fn> } }
    }
  ).electronAPI.provider.getAll
  return getAll.mock.calls.map((call) => call[0])
}

/** Moves the strip to a named machine, the way a person does. */
async function chooseHost(from: RegExp, label: string) {
  fireEvent.click(screen.getByRole('combobox', { name: from }))
  fireEvent.click(await screen.findByText(label))
}

describe('the option row obeys the strip (MAR-2682)', () => {
  beforeEach(() => {
    catalogsByHost = {
      local: { providers: entries(LOCAL_PROVIDERS), unreachableReason: null },
    }
    hangingHosts = new Set()
    deferredHosts = new Set()
    deferred = []
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      provider: {
        getAll: vi.fn(async (executionHostId?: string | null) => {
          // The main door's own rule, mirrored: absent, null and the empty
          // string mean this machine, and every other value -- whitespace
          // included -- is taken exactly as it was sent
          // (`ProviderCatalogService.get`). A fake that trimmed would repair
          // the one thing these tests exist to watch, and the guard on the far
          // side would be unobservable from here.
          const hostId =
            executionHostId === null ||
            executionHostId === undefined ||
            executionHostId === ''
              ? 'local'
              : executionHostId
          if (hangingHosts.has(hostId)) {
            return new Promise(() => {})
          }
          if (deferredHosts.has(hostId)) {
            return new Promise((resolve) => {
              deferred.push({ hostId, settle: resolve })
            })
          }
          const known = catalogsByHost[hostId]
          return {
            executionHostId: hostId,
            providers: known?.providers ?? [],
            unreachableReason:
              known?.unreachableReason ??
              (known ? null : `${hostId} did not answer.`),
          }
        }),
      },
      providerAccounts: {
        list: vi.fn(async () => [
          {
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
          },
        ]),
      },
      turns: { listForSession: vi.fn(async () => []) },
      providerQuota: { list: vi.fn(async () => []) },
      // The tier below the option row. A machine that cannot say where a
      // session would work holds the send, so a fake daemon that answered
      // about providers and nothing else would make every remote composer in
      // this suite unsendable for a reason none of these tests are about
      // (MAR-2689). It answers about the machine it was asked about, like the
      // door above it.
      executionHost: {
        getProjects: vi.fn(async (executionHostId?: string | null) => ({
          executionHostId: executionHostId ?? 'local',
          supported: true,
          projects: [
            {
              id: 'new-blok',
              name: 'new-blok',
              workingDirectory: '/srv/projects/new-blok',
              origin: null,
            },
          ],
          unreachableReason: null,
        })),
      },
      git: {
        getCloneableRepositoryUrl: vi.fn(
          async () => 'https://github.com/marckraw/new-blok.git',
        ),
      },
    }

    useSessionStore.setState({
      sessions: [],
      globalSessions: [],
      globalChatSessions: [],
      providerCatalogs: {},
      queuedInputsBySessionId: {},
      createAndStartSession: vi.fn(),
      createAndStartGlobalSession: vi.fn(),
      sendMessageToSession: vi.fn(),
      cancelQueuedInput: vi.fn(),
      error: null,
    })
    useAppSettingsStore.setState((state) => ({
      settings: { ...state.settings, executionHostEndpoints: [] },
    }))
    // The composer this suite renders names `project-1`, and the tier below the
    // option row asks that project what a daemon could clone. Without the row
    // there is no origin, so a remote composer could state no place and every
    // send would be held for a reason none of these tests are about
    // (MAR-2689).
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
    useSessionRelayStore.setState({ relays: [] })
    useSkillStore.setState({
      catalog: null,
      isCatalogLoading: false,
      catalogError: null,
      loadCatalog: vi.fn(),
      loadGlobalCatalog: vi.fn(),
    })
    useProjectContextStore.setState({
      itemsByProjectId: {},
      attachmentsBySessionId: {},
      loadForSession: vi.fn(),
      loadForProject: vi.fn(),
    })
  })

  it('lists that daemon’s providers and models, not this machine’s', async () => {
    // The literal complaint that opened MAR-2682: "when i select remote i still
    // see the same providers?" Pi is installed here and is not on that daemon,
    // and the daemon's model slug is not one this machine has ever heard of.
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://a.test')])
    catalogsByHost['daemon-a'] = {
      providers: entries([
        daemonProvider('claude-code', 'Claude Code', [
          { id: 'sonnet', label: 'Daemon Sonnet' },
        ]),
      ]),
      unreachableReason: null,
    }

    renderComposer()
    expect(
      await screen.findByRole('combobox', { name: 'Anthropic' }),
    ).toBeInTheDocument()

    await chooseHost(/Local/, 'kuba-vps')

    expect(
      await screen.findByRole('combobox', { name: 'Claude Code' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Daemon Sonnet' }),
    ).toBeInTheDocument()
    // Nothing of this machine's catalog survives the move.
    expect(screen.queryByRole('combobox', { name: 'Anthropic' })).toBeNull()
    expect(
      screen.queryByRole('combobox', { name: 'Claude Sonnet 4.5' }),
    ).toBeNull()

    fireEvent.click(screen.getByRole('combobox', { name: 'Claude Code' }))
    expect(
      await screen.findByRole('option', { name: /Claude Code/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Pi/ })).toBeNull()
  })

  it('never serves one endpoint’s catalog for another', async () => {
    setEndpoints([
      endpoint('daemon-a', 'kuba-vps', 'https://a.test', 0),
      endpoint('daemon-b', 'backpack', 'https://b.test', 1),
    ])
    catalogsByHost['daemon-a'] = {
      providers: entries([
        daemonProvider('claude-code', 'Claude Code', [
          { id: 'sonnet', label: 'A Sonnet' },
        ]),
      ]),
      unreachableReason: null,
    }
    catalogsByHost['daemon-b'] = {
      providers: entries([
        daemonProvider('codex', 'Codex', [{ id: 'gpt-b', label: 'B GPT' }]),
      ]),
      unreachableReason: null,
    }

    renderComposer()
    await chooseHost(/Local/, 'kuba-vps')
    expect(
      await screen.findByRole('combobox', { name: 'A Sonnet' }),
    ).toBeInTheDocument()

    await chooseHost(/kuba-vps/, 'backpack')
    expect(
      await screen.findByRole('combobox', { name: 'B GPT' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'A Sonnet' })).toBeNull()
  })

  it('refuses a catalog that lands about the address its endpoint has left', async () => {
    // An Endpoint id outlives the address behind it, and a catalog is a round
    // trip: edit the base URL mid-flight and the reply on the way back is an
    // answer about a machine this Endpoint no longer names. It is not late, it
    // is wrong, and it has to land nowhere rather than land over the answer
    // being fetched from the new address (MAR-2682, "a catalog dies with the
    // address it was read from").
    //
    // Sequenced by hand because the window is the whole point. Letting both
    // replies settle on their own would only prove the last write wins, which
    // is true either way.
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://a.test')])
    deferredHosts.add('daemon-a')

    renderComposer()
    await screen.findByRole('combobox', { name: 'Anthropic' })
    await chooseHost(/Local/, 'kuba-vps')
    await waitFor(() => expect(deferred).toHaveLength(1))

    // The address moves while that first request is still out.
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://moved.test')])
    await waitFor(() => expect(deferred).toHaveLength(2))

    // The old address answers, last. Nothing may come of it.
    await act(async () => {
      deferred[0]!.settle({
        executionHostId: 'daemon-a',
        providers: entries([
          daemonProvider('claude-code', 'Claude Code', [
            { id: 'sonnet', label: 'Old Machine Sonnet' },
          ]),
        ]),
        unreachableReason: null,
      })
    })

    expect(
      screen.queryByRole('combobox', { name: 'Old Machine Sonnet' }),
    ).toBeNull()
    expect(screen.getByTestId('composer-catalog-notice')).toHaveTextContent(
      'Asking kuba-vps which providers it runs',
    )

    // The machine it now names answers, and that one is the row.
    await act(async () => {
      deferred[1]!.settle({
        executionHostId: 'daemon-a',
        providers: entries([
          daemonProvider('codex', 'Codex', [
            { id: 'gpt-new', label: 'New Machine GPT' },
          ]),
        ]),
        unreachableReason: null,
      })
    })
    expect(
      await screen.findByRole('combobox', { name: 'New Machine GPT' }),
    ).toBeInTheDocument()
  })
  it('refuses a catalog that lands under a credential its endpoint has replaced', async () => {
    // The same defect through the one door S3 could not see: rotating a daemon
    // token in Settings changes neither the id nor the base URL, so the row's
    // source compared equal across it and the listing read under the old
    // credential stayed in force -- shown, and pickable (MAR-2689 round 6,
    // closing the S3 hole in the provider row). The token itself never crosses
    // the preload boundary and must not; the configuration epoch is what
    // crosses instead.
    //
    // Mutation: drop `endpoint.configurationEpoch` from the joined
    // configuration in `providerCatalogSourceForHost`, and this goes red --
    // the old machine's model is still on the row.
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://a.test', 0, 0)])
    deferredHosts.add('daemon-a')

    renderComposer()
    await screen.findByRole('combobox', { name: 'Anthropic' })
    await chooseHost(/Local/, 'kuba-vps')
    await waitFor(() => expect(deferred).toHaveLength(1))

    // The credential moves while that first request is still out. Same id,
    // same address: only the epoch says anything happened.
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://a.test', 0, 1)])
    await waitFor(() => expect(deferred).toHaveLength(2))

    // The old credential's answer arrives, last. Nothing may come of it.
    await act(async () => {
      deferred[0]!.settle({
        executionHostId: 'daemon-a',
        providers: entries([
          daemonProvider('claude-code', 'Claude Code', [
            { id: 'sonnet', label: 'Old Credential Sonnet' },
          ]),
        ]),
        unreachableReason: null,
      })
    })

    expect(
      screen.queryByRole('combobox', { name: 'Old Credential Sonnet' }),
    ).toBeNull()
    expect(screen.getByTestId('composer-catalog-notice')).toHaveTextContent(
      'Asking kuba-vps which providers it runs',
    )

    // And the machine as it is configured now answers, and that one is the row.
    await act(async () => {
      deferred[1]!.settle({
        executionHostId: 'daemon-a',
        providers: entries([
          daemonProvider('codex', 'Codex', [
            { id: 'gpt-new', label: 'New Credential GPT' },
          ]),
        ]),
        unreachableReason: null,
      })
    })
    expect(
      await screen.findByRole('combobox', { name: 'New Credential GPT' }),
    ).toBeInTheDocument()
  })

  it('says it is asking while a remote catalog is in flight, and shows nothing local', async () => {
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://a.test')])
    hangingHosts.add('daemon-a')

    renderComposer()
    await screen.findByRole('combobox', { name: 'Anthropic' })
    await chooseHost(/Local/, 'kuba-vps')

    const notice = await screen.findByTestId('composer-catalog-notice')
    expect(notice).toHaveTextContent('Asking kuba-vps which providers it runs')
    // Not yet known and local are different states, and they look different:
    // there are no provider controls at all while the question is out.
    expect(screen.queryByRole('combobox', { name: 'Anthropic' })).toBeNull()
    expect(
      screen.queryByRole('combobox', { name: 'Claude Sonnet 4.5' }),
    ).toBeNull()
    expect(screen.queryByText('a@example.com')).toBeNull()
    // Not "the controls, emptied" — no controls. An empty provider select
    // beside the sentence is a door with nothing behind it, and it reads as a
    // machine that runs nothing rather than one that has not answered. The
    // strip's own picker is the only combobox left standing.
    expect(
      screen.queryByRole('combobox', { name: 'Select provider' }),
    ).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Select model' })).toBeNull()
    // And the strip is still live, so he is never trapped on a silent machine.
    expect(screen.getByRole('combobox', { name: /kuba-vps/ })).toBeEnabled()
  })

  it('says which machine could not be asked when the catalog fails', async () => {
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://a.test')])
    catalogsByHost['daemon-a'] = {
      providers: [],
      unreachableReason: 'The daemon is unreachable.',
    }

    renderComposer()
    await chooseHost(/Local/, 'kuba-vps')

    expect(
      await screen.findByTestId('composer-catalog-notice'),
    ).toHaveTextContent(
      'kuba-vps could not be asked: The daemon is unreachable.',
    )
  })

  it('lists a provider the daemon will not run, disabled, in the daemon’s own words', async () => {
    // backpack-automations reports cursor: false. Listed and disabled rather
    // than dropped: a disabled row teaches what the machine cannot do, an
    // absent one is a mystery (MAR-2682, "a blocked provider is listed and
    // disabled, never dropped").
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://a.test')])
    // Cursor is listed first, and this daemon has no `claude-code` at all, so
    // the provider the composer was holding is not among these and the
    // selection has to fall back to the first row it can find. That is the only
    // arrangement in which a blocked row reaching the resolver is *visible*:
    // with a selectable claude-code present the pick is honoured and dropping
    // the filter changes nothing on screen (same ruling).
    catalogsByHost['daemon-a'] = {
      providers: entries(
        [
          daemonProvider('cursor', 'Cursor', [
            { id: 'cursor-1', label: 'Cursor Model' },
          ]),
          daemonProvider('codex', 'Codex', [
            { id: 'gpt-d', label: 'Daemon GPT' },
          ]),
        ],
        { cursor: 'The daemon reports Cursor as unavailable: missing binary.' },
      ),
      unreachableReason: null,
    }

    renderComposer()
    await chooseHost(/Local/, 'kuba-vps')
    await screen.findByRole('combobox', { name: 'Codex' })

    // The row settled on the one provider that machine will actually run.
    expect(
      screen.getByRole('combobox', { name: 'Daemon GPT' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Cursor Model' })).toBeNull()

    fireEvent.click(screen.getByRole('combobox', { name: 'Codex' }))
    const blocked = await screen.findByRole('option', { name: /Cursor/ })
    expect(blocked).toHaveAttribute('aria-disabled', 'true')
    expect(blocked).toHaveTextContent(
      'The daemon reports Cursor as unavailable: missing binary.',
    )

    // Nor can it be reached by clicking it.
    fireEvent.click(blocked)
    await waitFor(() => {
      expect(
        screen.getByRole('combobox', { name: 'Codex' }),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByRole('combobox', { name: 'Daemon GPT' }),
    ).toBeInTheDocument()
  })

  it('drops the account picker on a remote and keeps it on this machine', async () => {
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://a.test')])
    catalogsByHost['daemon-a'] = {
      providers: entries([
        daemonProvider('claude-code', 'Claude Code', [
          { id: 'sonnet', label: 'Daemon Sonnet' },
        ]),
      ]),
      unreachableReason: null,
    }

    renderComposer()
    // Local: the picker is there, naming the account by identity.
    expect(await screen.findByText('Default account')).toBeInTheDocument()

    await chooseHost(/Local/, 'kuba-vps')
    await screen.findByRole('combobox', { name: 'Claude Code' })

    // Remote: gone. Not disabled, not empty, not explained — a daemon has no
    // per-account concept, so there is no control (MAR-2682, "the account
    // picker is gone on a remote").
    expect(screen.queryByText('Default account')).toBeNull()
    expect(screen.queryByText(/local only/)).toBeNull()

    // Back here, and it returns: the control did not simply stop existing.
    await chooseHost(/kuba-vps/, 'Local')
    expect(await screen.findByText('Default account')).toBeInTheDocument()
  })

  it('names three remote providers three different things', async () => {
    // `vendorLabel: 'Remote daemon'` on every synthesized descriptor made the
    // row render the same word where each provider's name belonged, because the
    // primary label is `vendorLabel || name`. The Endpoint's display name is the
    // vendor and the strip already shows it; this row says which provider
    // (MAR-2682, "the row names the provider, not the machine").
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://a.test')])
    catalogsByHost['daemon-a'] = {
      providers: entries([
        daemonProvider('claude-code', 'Claude Code', [
          { id: 'sonnet', label: 'Daemon Sonnet' },
        ]),
        daemonProvider('codex', 'Codex', [{ id: 'gpt', label: 'Daemon GPT' }]),
        daemonProvider('cursor', 'Cursor', [
          { id: 'cur', label: 'Daemon Cur' },
        ]),
      ]),
      unreachableReason: null,
    }

    renderComposer()
    await chooseHost(/Local/, 'kuba-vps')
    const trigger = await screen.findByRole('combobox', { name: 'Claude Code' })

    fireEvent.click(trigger)
    const labels = ['Claude Code', 'Codex', 'Cursor']
    for (const label of labels) {
      expect(
        await screen.findByRole('option', { name: new RegExp(label) }),
      ).toBeInTheDocument()
    }
    // And no row anywhere still calls the provider by the machine's word.
    expect(screen.queryByText('Remote daemon')).toBeNull()
  })

  it('says a machine could not be re-asked over the listing that survived', async () => {
    // A dead daemon must not look alive. `describeCatalog` returns the
    // surviving listing *and* the failure together, so a refresh that failed
    // while an older answer was still in hand used to be invisible — the row
    // read the providers and never the reason (MAR-2682, "a dead daemon must
    // not look alive").
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://a.test')])
    catalogsByHost['daemon-a'] = {
      providers: entries([
        daemonProvider('codex', 'Codex', [{ id: 'gpt', label: 'Daemon GPT' }]),
      ]),
      unreachableReason: 'The daemon is unreachable.',
    }

    renderComposer()
    await chooseHost(/Local/, 'kuba-vps')

    // The options are still there — a blip must not empty a row that was right
    // a second ago.
    expect(
      await screen.findByRole('combobox', { name: 'Daemon GPT' }),
    ).toBeInTheDocument()
    // And the row says the machine could not be re-asked, loudly: the same
    // treatment the strip gives a session whose machine is gone.
    const notice = screen.getByTestId('composer-catalog-notice')
    expect(notice).toHaveTextContent(
      'kuba-vps could not be re-asked: The daemon is unreachable.',
    )
    expect(notice).toHaveClass('text-warning-foreground')
    // Still sendable: unconfirmed options are options, and gating the send on
    // "is there a sentence" rather than "are there options" would have made
    // this fix silently take the composer away.
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'go' },
    })
    expect(
      screen.getByRole('button', { name: 'Send message' }),
    ).not.toBeDisabled()
  })

  it('drops Fast mode and the quota pill on a remote, and keeps them here', async () => {
    // `serviceTier` is on EXECUTION_HOST_UNMAPPED_START_CONFIG_FIELDS and the
    // quota is read off the Codex CLI installed *here*. A control above the
    // strip that cannot act on the machine below it does not render
    // (MAR-2682, "fast mode and quota must not lie on a remote").
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://a.test')])
    catalogsByHost['local'] = {
      providers: entries([
        daemonProvider('codex', 'Codex', [
          { id: 'gpt-l', label: 'Laptop GPT' },
        ]),
      ]),
      unreachableReason: null,
    }
    catalogsByHost['daemon-a'] = {
      providers: entries([
        daemonProvider('codex', 'Codex', [
          { id: 'gpt-d', label: 'Daemon GPT' },
        ]),
      ]),
      unreachableReason: null,
    }

    renderComposer()
    // Local Codex: both controls are real, because this app owns that CLI.
    expect(
      await screen.findByRole('switch', { name: 'Fast mode' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Codex usage/ }),
    ).toBeInTheDocument()

    await chooseHost(/Local/, 'kuba-vps')
    await screen.findByRole('combobox', { name: 'Daemon GPT' })

    // Same provider, different machine: gone. Not disabled — absent.
    expect(screen.queryByRole('switch', { name: 'Fast mode' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Codex usage/ })).toBeNull()

    // Back here, and both return.
    await chooseHost(/kuba-vps/, 'Local')
    expect(
      await screen.findByRole('switch', { name: 'Fast mode' }),
    ).toBeInTheDocument()
  })

  it('leaves a Local row exactly as it was, endpoints configured or not', async () => {
    // Ruling 7. Any change to a Local session's options is a defect, so this
    // pins the whole row: every provider this machine has, its own model, its
    // own effort, its account picker, and no notice anywhere.
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://a.test')])

    renderComposer()

    expect(
      await screen.findByRole('combobox', { name: 'Anthropic' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Claude Sonnet 4.5' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Medium' })).toBeInTheDocument()
    expect(screen.getByText('Default account')).toBeInTheDocument()
    expect(screen.queryByTestId('composer-catalog-notice')).toBeNull()

    fireEvent.click(screen.getByRole('combobox', { name: 'Anthropic' }))
    expect(
      await screen.findByRole('option', { name: /Claude Code/ }),
    ).toBeInTheDocument()
    const pi = screen.getByRole('option', { name: /Pi/ })
    expect(pi).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('never makes a Local row wait, even before its catalog has arrived', async () => {
    // Ruling 7 again, at the one moment it is easy to break: this machine's
    // registry lives in this process and nobody waits on it, so there is no
    // "asking" state for it. Give local the same treatment a daemon gets and a
    // Local composer opens on a sentence where its controls used to be — a
    // change to options that must not change at all.
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://a.test')])
    hangingHosts.add('local')

    renderComposer()

    expect(
      await screen.findByRole('combobox', { name: 'Select provider' }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('composer-catalog-notice')).toBeNull()
  })

  it('asks this machine when no endpoint is configured at all', async () => {
    renderComposer()
    await screen.findByRole('combobox', { name: 'Anthropic' })

    expect(getAllCalls()).toEqual(['local'])
  })

  it('leaves an asking row no local control of any kind', async () => {
    // The strip is the only thing on screen that may still be operated while a
    // daemon has not answered. The permission preset used to survive here --
    // gated on whether a session exists rather than on whether the machine has
    // answered -- so the row emptied of provider, model, effort and account and
    // left an Ask/Yolo select standing over nothing: a control that claims a
    // rule for a provider nobody has named yet (MAR-2682, "an asking row must
    // have no local controls at all").
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://a.test')])
    hangingHosts.add('daemon-a')

    renderComposer()
    await screen.findByRole('combobox', { name: 'Anthropic' })
    // Opened here, on a row that has every right to it, so what follows is the
    // switch taking it away rather than it never having been there.
    fireEvent.click(
      screen.getByRole('button', { name: 'Advanced permission controls' }),
    )
    expect(
      screen.getByRole('combobox', { name: 'Ask before edits' }),
    ).toBeInTheDocument()

    await chooseHost(/Local/, 'kuba-vps')
    await screen.findByTestId('composer-catalog-notice')

    // Every combobox left in the composer belongs to the strip: the machine,
    // and beneath it where on that machine the session works. The place tier
    // reads the daemon's Projects, not its providers, so a silent provider
    // listing is no reason for it to disappear (MAR-2689).
    const comboboxes = screen.getAllByRole('combobox')
    expect(comboboxes).toHaveLength(2)
    expect(comboboxes[0]).toHaveAccessibleName(/kuba-vps/)
    expect(comboboxes[1]).toHaveAccessibleName(/marckraw\/new-blok/)
    // The permission preset and both doors to its advanced panel, gone with the
    // cluster they belong to.
    expect(screen.queryByRole('combobox', { name: 'Ask' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Advanced permission controls' }),
    ).toBeNull()
    expect(
      screen.queryByRole('combobox', { name: 'Ask before edits' }),
    ).toBeNull()
  })

  it('closes a permission panel that was open before the machine went silent', async () => {
    // The advanced button is gone on an asking row, and that is not enough. The
    // panel it opens is component state, and a session born from a draft that
    // had it open keeps it open -- so a session on a machine still being asked
    // renders a live Claude permission-mode control beneath a sentence saying
    // the daemon has not answered. The row's own state has to close it, not the
    // button's absence (MAR-2682, "an asking row must have no local controls at
    // all").
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://a.test')])
    hangingHosts.add('daemon-a')

    const { rerender } = renderComposer()
    await screen.findByRole('combobox', { name: 'Anthropic' })
    fireEvent.click(
      screen.getByRole('button', { name: 'Advanced permission controls' }),
    )
    expect(
      screen.getByRole('combobox', { name: 'Ask before edits' }),
    ).toBeInTheDocument()

    // The same composer, now behind a live session on a machine that is not
    // answering: the panel's own open flag survives, the row must not.
    seedLiveSession('daemon-a')
    rerender(
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
      await screen.findByTestId('composer-catalog-notice'),
    ).toHaveTextContent('Asking kuba-vps which providers it runs')
    expect(
      screen.queryByRole('combobox', { name: 'Ask before edits' }),
    ).toBeNull()
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
  })

  it('asks about this machine for a session whose recorded host is blank', async () => {
    // The other half of the record rule, at the seam where it is observable
    // (MAR-2682). A `execution_host` column that is blank or whitespace is a
    // row written before Endpoints existed, and the backend resolves that
    // session to this machine -- so the row above the strip must ask about this
    // machine too. A strip that took whitespace for a machine id would put an
    // "Asking …" row above a session the daemon has never heard of, while the
    // turn ran here: the strip contradicting where the work goes.
    //
    // Mutation: give the strip its own narrower reading of the record --
    // `live === '' ? 'local' : live` in `resolveExecutionBarView` -- and this
    // goes red: `provider:getAll` is asked about `'   '`, and the row renders a
    // notice about a machine that does not exist.
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://a.test')])
    seedLiveSession('   ')

    renderComposer('session-1')

    await waitFor(() => expect(getAllCalls()).toContain('local'))
    expect(getAllCalls()).not.toContain('   ')
    // And the row is this machine's, with no notice about an unreachable one.
    expect(
      await screen.findByRole('combobox', { name: 'Anthropic' }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('composer-catalog-notice')).toBeNull()
  })

  it('sends the endpoint id a session recorded, exactly as recorded', async () => {
    // The renderer's half of one rule at both doors, and only that half: a
    // padded id leaves here unrewritten. The renderer used to trim on the way
    // out, so ` daemon-a ` arrived as `daemon-a` and the main door's refusal
    // could never fire from the product at all.
    //
    // That the far door then refuses it is `ProviderCatalogService.get`'s own
    // suite. The fake above answers for an unasked machine, so the notice
    // asserted below is this row *rendering* a refusal, not this row proving
    // one (MAR-2682).
    setEndpoints([endpoint('daemon-a', 'kuba-vps', 'https://a.test')])
    catalogsByHost['daemon-a'] = {
      providers: entries([
        daemonProvider('codex', 'Codex', [
          { id: 'gpt-d', label: 'Daemon GPT' },
        ]),
      ]),
      unreachableReason: null,
    }
    seedLiveSession(' daemon-a ')

    renderComposer('session-1')

    // Asked about the string the record holds, and never about the tidy one.
    await waitFor(() => expect(getAllCalls()).toContain(' daemon-a '))
    expect(getAllCalls()).not.toContain('daemon-a')
    // And the row says what that means instead of showing daemon-a's options.
    expect(
      await screen.findByTestId('composer-catalog-notice'),
    ).toHaveTextContent('could not be asked')
    expect(screen.queryByRole('combobox', { name: 'Daemon GPT' })).toBeNull()
  })
})
