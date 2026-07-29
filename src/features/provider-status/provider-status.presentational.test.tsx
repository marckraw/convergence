import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProviderStatusInfo } from '@/entities/session'
import { ProviderStatusDialog } from './provider-status.presentational'

function buildStatus(
  overrides: Partial<ProviderStatusInfo> = {},
): ProviderStatusInfo {
  return {
    id: 'pi',
    name: 'Pi Agent',
    vendorLabel: 'Pi',
    availability: 'available',
    statusLabel: 'Available',
    binaryPath: '/usr/local/bin/pi',
    install: null,
    version: '0.82.1',
    reason: null,
    update: {
      currentVersion: '0.82.1',
      latestVersion: '0.82.1',
      status: 'current',
      packageName: '@earendil-works/pi-coding-agent',
      installCommand: 'npm install -g @earendil-works/pi-coding-agent@latest',
      updateCommand: 'npm install -g @earendil-works/pi-coding-agent@latest',
      manualUpdateCommand:
        'npm install -g @earendil-works/pi-coding-agent@latest',
      automaticUpdateCommand: null,
      updateCapability: 'manual',
      updateStrategy: 'npm-global',
      checkError: null,
    },
    ...overrides,
  }
}

function renderDialog(statuses: ProviderStatusInfo[]) {
  render(
    <ProviderStatusDialog
      open
      onOpenChange={vi.fn()}
      trigger={<button type="button">open</button>}
      statuses={statuses}
      runtimeInfo={null}
      isLoading={false}
      updatingProviderId={null}
      error={null}
      message={null}
      onRefresh={vi.fn()}
      onUpdateProvider={vi.fn()}
    />,
  )
}

describe('ProviderStatusDialog', () => {
  // The version-floor warning is only useful if it is actually readable; the
  // reason used to render for unavailable providers only.
  it('shows the reason for an installed but degraded provider', () => {
    renderDialog([
      buildStatus({
        statusLabel: 'Update recommended',
        reason:
          'Pi older than 0.80.4 cannot report when a run has fully settled.',
      }),
    ])

    expect(
      screen.getByText(
        'Pi older than 0.80.4 cannot report when a run has fully settled.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Update recommended')).toBeInTheDocument()
  })

  it('stays quiet for a healthy provider', () => {
    renderDialog([buildStatus()])

    expect(screen.getByText('Available')).toBeInTheDocument()
    // Rendered twice: once as the installed version, once as the latest.
    expect(screen.getAllByText('0.82.1')).toHaveLength(2)
  })
})
