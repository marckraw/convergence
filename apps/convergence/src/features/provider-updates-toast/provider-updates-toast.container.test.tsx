import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { notify } from '@convergence/ui'
import { useProviderUpdatesStore } from '@/entities/provider-updates'
import type { ProviderStatusInfo } from '@/entities/session'
import { ProviderUpdatesToastContainer } from './provider-updates-toast.container'

vi.mock('@convergence/ui', () => ({
  notify: {
    info: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
    failure: vi.fn(),
    dismiss: vi.fn(),
  },
}))

const notifyMock = vi.mocked(notify)
const updateProvider = vi.fn<() => Promise<void>>()
const updateAllOutdated = vi.fn<() => Promise<void>>()
const clearResult = vi.fn()

function makeProvider(overrides: Partial<ProviderStatusInfo> = {}) {
  return {
    id: 'codex',
    name: 'Codex',
    vendorLabel: 'OpenAI',
    availability: 'available',
    statusLabel: 'Available',
    binaryPath: '/Users/me/bin/codex',
    install: null,
    version: 'codex-cli 0.128.0',
    reason: null,
    update: {
      currentVersion: '0.128.0',
      latestVersion: '0.130.0',
      status: 'outdated',
      packageName: '@openai/codex',
      installCommand: 'npm install -g @openai/codex@latest',
      updateCommand: 'npm install -g @openai/codex@latest',
      manualUpdateCommand: 'npm install -g @openai/codex@latest',
      automaticUpdateCommand:
        '/opt/node/bin/npm install -g @openai/codex@latest',
      updateCapability: 'automatic',
      updateStrategy: 'npm-global',
      checkError: null,
    },
    ...overrides,
  } satisfies ProviderStatusInfo
}

function resetStore() {
  useProviderUpdatesStore.setState({
    statuses: [],
    checkedAt: null,
    isLoaded: true,
    isChecking: false,
    lastTrigger: null,
    updatingProviderId: null,
    lastResult: null,
    error: null,
    unsubscribe: null,
    intervalId: null,
    updateProvider,
    updateAllOutdated,
    clearResult,
  })
}

describe('ProviderUpdatesToastContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateProvider.mockReset()
    updateAllOutdated.mockReset()
    clearResult.mockReset()
    resetStore()
  })

  it('renders an update toast for an automatically updatable provider', () => {
    const { rerender } = render(<ProviderUpdatesToastContainer />)
    useProviderUpdatesStore.setState({ statuses: [makeProvider()] })
    rerender(<ProviderUpdatesToastContainer />)

    expect(notifyMock.info).toHaveBeenCalledWith(
      'Provider update available — Codex 0.130.0',
      expect.objectContaining({
        id: 'provider-updates:available',
        action: expect.objectContaining({ label: 'Update' }),
        secondaryAction: expect.objectContaining({ label: 'Providers' }),
        persistent: true,
      }),
    )

    const call = notifyMock.info.mock.calls.at(-1)
    call?.[1]?.action?.onClick()
    expect(updateProvider).toHaveBeenCalledTimes(1)
  })

  it('does not render update toast for manual-only providers', () => {
    const { rerender } = render(<ProviderUpdatesToastContainer />)
    useProviderUpdatesStore.setState({
      statuses: [
        makeProvider({
          update: {
            ...makeProvider().update,
            updateCapability: 'manual',
            updateStrategy: null,
            automaticUpdateCommand: null,
          },
        }),
      ],
    })
    rerender(<ProviderUpdatesToastContainer />)

    expect(notifyMock.info).not.toHaveBeenCalled()
  })

  it('renders success after a provider update result', () => {
    const { rerender } = render(<ProviderUpdatesToastContainer />)
    useProviderUpdatesStore.setState({
      lastResult: {
        providerId: 'codex',
        providerName: 'Codex',
        ok: true,
        error: null,
      },
    })
    rerender(<ProviderUpdatesToastContainer />)

    expect(notifyMock.success).toHaveBeenCalledWith(
      'Codex updated',
      expect.objectContaining({
        description: 'New sessions will use the refreshed provider.',
      }),
    )
    expect(clearResult).toHaveBeenCalledTimes(1)
  })

  it('words a failed update "Couldn’t update Codex." with the reason (R10)', () => {
    const { rerender } = render(<ProviderUpdatesToastContainer />)
    useProviderUpdatesStore.setState({
      lastResult: {
        providerId: 'codex',
        providerName: 'Codex',
        ok: false,
        error: 'npm exited with code 1.',
      },
    })
    rerender(<ProviderUpdatesToastContainer />)

    expect(notifyMock.failure).toHaveBeenCalledWith(
      'update Codex',
      'npm exited with code 1.',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Providers' }),
      }),
    )
    expect(clearResult).toHaveBeenCalledTimes(1)
  })
})
