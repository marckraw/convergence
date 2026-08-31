import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExecutionHostEndpoint } from '@/entities/execution-host'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { ExecutionHostSettingsContainer } from './execution-host-settings.container'
import {
  executionHostSessionCounts,
  type ExecutionHostEndpointDraft,
  type ExecutionHostSessionCounts,
} from './execution-host-settings.pure'

/**
 * Drives the container through `window.electronAPI` rather than through a
 * mocked callback, so the api module and the container's own state are part of
 * what is pinned: the daemon's answer has to survive the whole path from the
 * preload boundary to rendered text.
 */
const executionHost = {
  testRemoteConnection: vi.fn(),
  getSessionWorkspace: vi.fn(),
  sessionCountsByEndpoint: vi.fn(),
}

const executionHostDaemon = {
  getStatus: vi.fn(),
  setToken: vi.fn(),
  deleteToken: vi.fn(),
}

const CREDENTIAL_STATUS = {
  providerId: 'execution-host-daemon' as const,
  configured: true,
  source: 'keychain' as const,
  storage: 'keychain' as const,
  account: 'daemon',
  service: 'convergence',
  error: null,
}

const ENDPOINT_ID = 'backpack-automations'
const BASE_URL = 'https://daemon.test'

function draft(
  overrides: Partial<ExecutionHostEndpointDraft> = {},
): ExecutionHostEndpointDraft {
  return {
    id: ENDPOINT_ID,
    label: 'backpack-automations',
    baseUrl: BASE_URL,
    ...overrides,
  }
}

function saved(
  overrides: Partial<ExecutionHostEndpoint> = {},
): ExecutionHostEndpoint {
  return {
    id: ENDPOINT_ID,
    label: 'backpack-automations',
    baseUrl: BASE_URL,
    position: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    configurationEpoch: 0,
    ...overrides,
  }
}

function counted(sessions: number): ExecutionHostSessionCounts {
  return executionHostSessionCounts([
    { executionHostId: ENDPOINT_ID, sessions },
  ])
}

function renderContainer(
  props: Partial<Parameters<typeof ExecutionHostSettingsContainer>[0]> = {},
) {
  const onRemove = vi.fn()
  const view = render(
    <TooltipProvider>
      <ExecutionHostSettingsContainer
        draft={draft()}
        saved={saved()}
        sessionCounts={counted(0)}
        onLabelChange={vi.fn()}
        onRemoteBaseUrlChange={vi.fn()}
        onRemove={onRemove}
        {...props}
      />
    </TooltipProvider>,
  )
  return { ...view, onRemove, props }
}

describe('ExecutionHostSettingsContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    executionHostDaemon.getStatus.mockResolvedValue(CREDENTIAL_STATUS)
    executionHostDaemon.setToken.mockResolvedValue(CREDENTIAL_STATUS)
    executionHostDaemon.deleteToken.mockResolvedValue({
      ...CREDENTIAL_STATUS,
      configured: false,
      source: null,
      storage: null,
    })
    executionHost.testRemoteConnection.mockResolvedValue({
      ok: true,
      state: 'connected',
      baseUrl: BASE_URL,
      message: 'Connected. 2 providers available.',
      providers: [
        {
          providerId: 'claude',
          name: 'Claude Code',
          available: true,
          authenticated: true,
          supportsContinuation: true,
          models: [],
        },
      ],
      daemon: {
        version: '0.26.1',
        apiVersion: 'v0',
        protocolCapabilities: ['deltas.append.v1', 'projects.v1'],
      },
    })
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      executionHost,
      credentials: { executionHostDaemon },
    }
  })

  it('shows what the daemon said about itself after Test connection', async () => {
    renderContainer()
    await screen.findByText('Configured in Keychain, token hidden')

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Test connection for backpack-automations',
      }),
    )

    expect(
      await screen.findByText('Connected. 2 providers available.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('agents-daemon 0.26.1 · API v0'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        '2 execution protocol capabilities: deltas.append.v1, projects.v1',
      ),
    ).toBeInTheDocument()
  })

  it('says nothing about a daemon that served no /health', async () => {
    executionHost.testRemoteConnection.mockResolvedValue({
      ok: true,
      state: 'connected',
      baseUrl: BASE_URL,
      message: 'Connected. 1 provider available.',
      providers: [],
      daemon: null,
    })

    renderContainer()
    await screen.findByText('Configured in Keychain, token hidden')

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Test connection for backpack-automations',
      }),
    )

    expect(
      await screen.findByText('Connected. 1 provider available.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/agents-daemon/)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/execution protocol capabilities/),
    ).not.toBeInTheDocument()
  })

  it('reports a failed connection test instead of leaving the surface blank', async () => {
    executionHost.testRemoteConnection.mockRejectedValue(
      new Error('Daemon unreachable.'),
    )

    renderContainer()
    await screen.findByText('Configured in Keychain, token hidden')

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Test connection for backpack-automations',
      }),
    )

    expect(await screen.findByText('Daemon unreachable.')).toBeInTheDocument()
  })

  /**
   * MAR-2629's canary on the renderer side. Every daemon call this row makes
   * has to carry this row's Endpoint id — `'default'` is another machine now,
   * and a token saved to it would authenticate as one.
   */
  it('names its own endpoint on every daemon call, never the ambient default', async () => {
    renderContainer()
    await waitFor(() =>
      expect(executionHostDaemon.getStatus).toHaveBeenCalledWith(ENDPOINT_ID),
    )

    fireEvent.change(screen.getByLabelText('Execution host token'), {
      target: { value: 'sk-live' },
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Save token for backpack-automations',
      }),
    )
    await waitFor(() =>
      expect(executionHostDaemon.setToken).toHaveBeenCalledWith(
        ENDPOINT_ID,
        'sk-live',
      ),
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove token for backpack-automations',
      }),
    )
    await waitFor(() =>
      expect(executionHostDaemon.deleteToken).toHaveBeenCalledWith(ENDPOINT_ID),
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Test connection for backpack-automations',
      }),
    )
    await waitFor(() =>
      expect(executionHost.testRemoteConnection).toHaveBeenCalledWith(
        ENDPOINT_ID,
      ),
    )
  })

  it('refuses token and connection work on an endpoint that was never saved', async () => {
    renderContainer({ saved: null, draft: draft({ label: 'kuba-vps' }) })

    expect(
      await screen.findByText(
        'Save settings first — this endpoint does not exist yet.',
      ),
    ).toBeInTheDocument()
    // Asking about an endpoint the main process cannot find would come back as
    // a refusal that reads like a broken token.
    expect(executionHostDaemon.getStatus).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Test connection for kuba-vps' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Save token for kuba-vps' }),
    ).toBeDisabled()
  })

  it('blocks only the connection test while the typed URL is not the saved one', async () => {
    renderContainer({
      draft: draft({ baseUrl: 'https://moved.test' }),
    })

    await screen.findByText('Configured in Keychain, token hidden')
    expect(
      screen.getByRole('button', {
        name: 'Test connection for backpack-automations',
      }),
    ).toBeDisabled()
    expect(
      screen.getByText(
        `Save to test the URL you typed — this endpoint still points at ${BASE_URL}.`,
      ),
    ).toBeInTheDocument()
    // The Keychain account is the id, and the id did not change.
    expect(
      screen.getByRole('button', {
        name: 'Remove token for backpack-automations',
      }),
    ).toBeEnabled()
  })

  it('makes a removal that costs sessions say so before it happens', async () => {
    const { onRemove } = renderContainer({ sessionCounts: counted(3) })

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove endpoint backpack-automations',
      }),
    )

    expect(
      await screen.findByText(
        '3 sessions run on “backpack-automations”. Removing it does not move ' +
          'them — they will refuse to run, because a session may only run on ' +
          'the machine it named.',
      ),
    ).toBeInTheDocument()
    expect(onRemove).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Confirm removing endpoint backpack-automations',
      }),
    )
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('warns about an uncounted removal rather than treating it as free', async () => {
    const { onRemove } = renderContainer({
      sessionCounts: { status: 'failed' },
    })

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove endpoint backpack-automations',
      }),
    )

    expect(
      await screen.findByText(/could not count the sessions/),
    ).toBeInTheDocument()
    expect(onRemove).not.toHaveBeenCalled()
  })

  it('will not remove an endpoint while the count is still in flight', () => {
    // The stale-count hole: a zero left over from the previous open would
    // authorise this removal with no ceremony at all while the real count was
    // still being read. A removal is priced by a count, so it waits for one.
    const { onRemove } = renderContainer({
      sessionCounts: { status: 'counting' },
    })

    const remove = screen.getByRole('button', {
      name: 'Remove endpoint backpack-automations',
    })
    expect(remove).toBeDisabled()
    expect(remove.getAttribute('title')).toMatch(
      /Still counting the sessions that run on “backpack-automations”/,
    )

    fireEvent.click(remove)
    expect(onRemove).not.toHaveBeenCalled()
  })

  it('removes an endpoint nothing names without ceremony', () => {
    const { onRemove } = renderContainer({ sessionCounts: counted(0) })

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove endpoint backpack-automations',
      }),
    )

    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  /**
   * A connection result is an answer about one address. Retyping the address
   * with a green "Connected" still sitting under it is this era's own
   * constraint broken in its own settings panel: the surface would be showing
   * something that does not match the machine it names.
   */
  it('drops a connection result the moment the address it describes is edited', async () => {
    const { rerender } = renderContainer()
    await screen.findByText('Configured in Keychain, token hidden')

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Test connection for backpack-automations',
      }),
    )
    expect(
      await screen.findByText('Connected. 2 providers available.'),
    ).toBeInTheDocument()

    rerender(
      <TooltipProvider>
        <ExecutionHostSettingsContainer
          draft={draft({ baseUrl: 'https://moved.test' })}
          saved={saved()}
          sessionCounts={counted(0)}
          onLabelChange={vi.fn()}
          onRemoteBaseUrlChange={vi.fn()}
          onRemove={vi.fn()}
        />
      </TooltipProvider>,
    )

    expect(
      screen.queryByText('Connected. 2 providers available.'),
    ).not.toBeInTheDocument()
  })

  /**
   * The same staleness in the other dimension (MAR-2642). A test authenticates
   * with one token, so an answer that lands after the token was replaced
   * describes a handshake nothing would repeat.
   *
   * The order here is the one only provenance survives: the dial goes out
   * first, the token changes while it is in flight, and the answer arrives
   * afterwards — too late for anything to have cleared it, and carrying its own
   * proof that it is no longer about this row.
   */
  it('never shows a connection result that arrives after the token was replaced', async () => {
    let answerConnection!: (result: unknown) => void
    executionHost.testRemoteConnection.mockImplementation(
      () =>
        new Promise((resolve) => {
          answerConnection = resolve
        }),
    )
    renderContainer()
    await screen.findByText('Configured in Keychain, token hidden')

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Test connection for backpack-automations',
      }),
    )
    await waitFor(() =>
      expect(executionHost.testRemoteConnection).toHaveBeenCalledWith(
        ENDPOINT_ID,
      ),
    )

    fireEvent.change(screen.getByLabelText('Execution host token'), {
      target: { value: 'sk-live' },
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Save token for backpack-automations',
      }),
    )
    expect(
      await screen.findByText('Daemon API token saved.'),
    ).toBeInTheDocument()

    await act(async () => {
      answerConnection({
        ok: true,
        state: 'connected',
        baseUrl: BASE_URL,
        message: 'Connected. 2 providers available.',
        providers: [],
        daemon: null,
      })
    })

    expect(
      screen.queryByText('Connected. 2 providers available.'),
    ).not.toBeInTheDocument()
  })

  it('keeps the result when the same address is merely re-typed', async () => {
    const { rerender } = renderContainer()
    await screen.findByText('Configured in Keychain, token hidden')

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Test connection for backpack-automations',
      }),
    )
    expect(
      await screen.findByText('Connected. 2 providers available.'),
    ).toBeInTheDocument()

    rerender(
      <TooltipProvider>
        <ExecutionHostSettingsContainer
          draft={draft({ baseUrl: 'HTTPS://Daemon.Test/' })}
          saved={saved()}
          sessionCounts={counted(0)}
          onLabelChange={vi.fn()}
          onRemoteBaseUrlChange={vi.fn()}
          onRemove={vi.fn()}
        />
      </TooltipProvider>,
    )

    expect(
      screen.getByText('Connected. 2 providers available.'),
    ).toBeInTheDocument()
  })
})
