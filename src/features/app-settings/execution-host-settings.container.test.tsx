import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { ExecutionHostSettingsContainer } from './execution-host-settings.container'

/**
 * Drives the container through `window.electronAPI` rather than through a
 * mocked callback, so the api module and the container's own state are part of
 * what is pinned: the daemon's answer has to survive the whole path from the
 * preload boundary to rendered text.
 */
const executionHost = {
  testRemoteConnection: vi.fn(),
  getSessionWorkspace: vi.fn(),
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

function renderContainer() {
  return render(
    <TooltipProvider>
      <ExecutionHostSettingsContainer
        remoteBaseUrlDraft="https://daemon.test"
        remoteBaseUrlError={null}
        onRemoteBaseUrlChange={vi.fn()}
      />
    </TooltipProvider>,
  )
}

describe('ExecutionHostSettingsContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    executionHostDaemon.getStatus.mockResolvedValue(CREDENTIAL_STATUS)
    executionHost.testRemoteConnection.mockResolvedValue({
      ok: true,
      state: 'connected',
      baseUrl: 'https://daemon.test',
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
      screen.getByRole('button', { name: 'Test execution host connection' }),
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
      baseUrl: 'https://daemon.test',
      message: 'Connected. 1 provider available.',
      providers: [],
      daemon: null,
    })

    renderContainer()
    await screen.findByText('Configured in Keychain, token hidden')

    fireEvent.click(
      screen.getByRole('button', { name: 'Test execution host connection' }),
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
      screen.getByRole('button', { name: 'Test execution host connection' }),
    )

    expect(await screen.findByText('Daemon unreachable.')).toBeInTheDocument()
  })
})
