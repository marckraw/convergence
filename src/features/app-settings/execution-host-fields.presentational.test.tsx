import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RemoteExecutionHostConnectionResult } from '@/entities/app-settings'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { ExecutionHostFields } from './execution-host-fields.presentational'

function renderFields(
  connectionResult: RemoteExecutionHostConnectionResult,
): void {
  render(
    <TooltipProvider>
      <ExecutionHostFields {...makeProps(connectionResult)} />
    </TooltipProvider>,
  )
}

function makeProps(
  connectionResult: RemoteExecutionHostConnectionResult | null,
): Parameters<typeof ExecutionHostFields>[0] {
  return {
    endpointId: 'default',
    displayName: 'kuba-vps',
    labelDraft: 'kuba-vps',
    remoteBaseUrlDraft: 'https://daemon.test',
    remoteBaseUrlError: null,
    actionBlocks: { token: null, connection: null },
    credentialStatus: {
      providerId: 'execution-host-daemon',
      configured: true,
      source: 'keychain',
      storage: 'keychain',
      account: 'daemon',
      service: 'convergence',
      error: null,
    },
    daemonTokenDraft: '',
    showDaemonToken: false,
    isCredentialSaving: false,
    isConnectionTesting: false,
    credentialMessage: null,
    credentialError: null,
    connectionResult,
    removalWarning: null,
    isRemovalPending: false,
    onLabelChange: vi.fn(),
    onRemoteBaseUrlChange: vi.fn(),
    onDaemonTokenChange: vi.fn(),
    onToggleDaemonTokenVisibility: vi.fn(),
    onSaveDaemonToken: vi.fn(),
    onDeleteDaemonToken: vi.fn(),
    onTestDaemonConnection: vi.fn(),
    onRequestRemove: vi.fn(),
    onConfirmRemove: vi.fn(),
    onCancelRemove: vi.fn(),
  }
}

function connected(
  daemon: RemoteExecutionHostConnectionResult['daemon'],
): RemoteExecutionHostConnectionResult {
  return {
    ok: true,
    state: 'connected',
    baseUrl: 'https://daemon.test',
    message: 'Connected. 2 providers available.',
    providers: [],
    daemon,
  }
}

/**
 * The one thing this slice adds that a human can see. These pin the rendered
 * text, not the props, because "what did the daemon tell me" is the whole
 * point of the addition.
 */
describe('ExecutionHostFields connection result', () => {
  it('names the daemon and lists what its protocol can do', () => {
    renderFields(
      connected({
        version: '0.26.1',
        apiVersion: 'v0',
        protocolCapabilities: ['commands.approval', 'deltas.append.v1'],
      }),
    )

    expect(
      screen.getByText('agents-daemon 0.26.1 · API v0'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        '2 execution protocol capabilities: commands.approval, deltas.append.v1',
      ),
    ).toBeInTheDocument()
  })

  it('says so plainly when a daemon advertises no capabilities', () => {
    renderFields(
      connected({
        version: '0.24.0',
        apiVersion: 'v0',
        protocolCapabilities: [],
      }),
    )

    expect(
      screen.getByText('No execution protocol capabilities advertised'),
    ).toBeInTheDocument()
  })

  it('stays silent about a daemon that never introduced itself', () => {
    renderFields(connected(null))

    expect(
      screen.getByText('Connected. 2 providers available.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/agents-daemon/)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/execution protocol capabilities/),
    ).not.toBeInTheDocument()
  })

  it('renders an incompatible daemon as an alert that still names it', () => {
    renderFields({
      ok: false,
      state: 'incompatible',
      baseUrl: 'https://daemon.test',
      message: 'Daemon execution protocol is incompatible with this app',
      providers: [],
      daemon: {
        version: '0.99.0',
        apiVersion: 'v0',
        protocolCapabilities: [],
      },
    })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(
      'Daemon execution protocol is incompatible with this app',
    )
    expect(alert).toHaveTextContent('agents-daemon 0.99.0 · API v0')
  })
})
