import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { toast } from 'sonner'
import { useProviderUpdatesStore } from '@/entities/provider-updates'
import type { ProviderStatusInfo } from '@/entities/session'
import { ProviderUpdatesToastContainer } from './provider-updates-toast.container'

type SonnerFn = ReturnType<typeof vi.fn> & {
  info: ReturnType<typeof vi.fn>
  loading: ReturnType<typeof vi.fn>
  success: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
  dismiss: ReturnType<typeof vi.fn>
}

vi.mock('sonner', () => {
  const fn = Object.assign(vi.fn(), {
    info: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  })
  return { toast: fn }
})

const sonnerMock = toast as unknown as SonnerFn
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
    sonnerMock.mockReset()
    sonnerMock.info.mockReset()
    sonnerMock.loading.mockReset()
    sonnerMock.success.mockReset()
    sonnerMock.error.mockReset()
    sonnerMock.dismiss.mockReset()
    updateProvider.mockReset()
    updateAllOutdated.mockReset()
    clearResult.mockReset()
    resetStore()
  })

  it('renders an update toast for an automatically updatable provider', () => {
    const { rerender } = render(<ProviderUpdatesToastContainer />)
    useProviderUpdatesStore.setState({ statuses: [makeProvider()] })
    rerender(<ProviderUpdatesToastContainer />)

    expect(sonnerMock.info).toHaveBeenCalledWith(
      'Provider update available - Codex 0.130.0',
      expect.objectContaining({
        id: 'provider-updates:available',
        action: expect.objectContaining({ label: 'Update' }),
        cancel: expect.objectContaining({ label: 'Providers' }),
      }),
    )

    const call = sonnerMock.info.mock.calls.at(-1)
    call?.[1].action.onClick()
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

    expect(sonnerMock.info).not.toHaveBeenCalled()
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

    expect(sonnerMock.success).toHaveBeenCalledWith(
      'Codex updated',
      expect.objectContaining({
        description: 'New sessions will use the refreshed provider.',
      }),
    )
    expect(clearResult).toHaveBeenCalledTimes(1)
  })
})
