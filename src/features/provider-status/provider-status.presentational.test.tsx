import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProviderStatusInfo } from '@/entities/session'
import type {
  ProviderAccount,
  ProviderAccountHealth,
} from '@/entities/provider-account'
import { ProviderStatusDialog } from './provider-status.presentational'

function buildAccount(
  overrides: Partial<ProviderAccount> = {},
): ProviderAccount {
  return {
    id: 'acct-a',
    providerId: 'claude-code',
    label: 'Personal Max',
    authKind: 'subscription-oauth',
    email: 'a@example.com',
    orgId: 'org-a',
    plan: 'max',
    configDir: '/config',
    credentialDir: '/credentials',
    executionHostId: 'local',
    isDefault: false,
    status: 'connected',
    lastValidatedAt: null,
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    ...overrides,
  }
}

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

function renderDialog(
  statuses: ProviderStatusInfo[],
  accounts: ProviderAccount[] = [],
  health: ProviderAccountHealth | null = null,
) {
  render(
    <ProviderStatusDialog
      open
      onOpenChange={vi.fn()}
      trigger={<button type="button">open</button>}
      statuses={statuses}
      runtimeInfo={null}
      providerAccounts={accounts}
      providerAccountHealth={health}
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

  it('says nothing about accounts when none are enrolled', () => {
    renderDialog([buildStatus()])

    expect(screen.queryByText(/Claude account/)).not.toBeInTheDocument()
  })

  it('presents an account by identity rather than as an anonymous slot', () => {
    renderDialog([buildStatus()], [buildAccount({ isDefault: true })])

    expect(screen.getByText('1 Claude account')).toBeInTheDocument()
    expect(screen.getByText(/a@example\.com/)).toBeInTheDocument()
    expect(screen.getByText('org org-a')).toBeInTheDocument()
    expect(screen.getByText('default')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('shows an account attestation disabled and why', () => {
    renderDialog([buildStatus()], [buildAccount({ status: 'unavailable' })], {
      checkedAt: '2026-08-03T01:00:00.000Z',
      claudeVersion: '2.1.220',
      accounts: [
        {
          accountId: 'acct-a',
          label: 'Personal Max',
          email: 'a@example.com',
          outcome: 'identity-mismatch',
          status: 'unavailable',
          detail: 'Enrolled as a@example.com but now reports b@example.com.',
          unknownEntries: [],
          missingLinks: [],
        },
      ],
      settingsWarnings: [],
    })

    expect(screen.getByText('Disabled')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Enrolled as a@example.com but now reports b@example.com.',
      ),
    ).toBeInTheDocument()
  })

  it('warns when shared settings make account selection decorative', () => {
    renderDialog([buildStatus()], [buildAccount()], {
      checkedAt: '2026-08-03T01:00:00.000Z',
      claudeVersion: '2.1.220',
      accounts: [],
      settingsWarnings: [
        { kind: 'api-key-helper', key: 'apiKeyHelper', message: 'x' },
      ],
    })

    expect(
      screen.getByText(/account selection has no effect/),
    ).toBeInTheDocument()
  })

  it('surfaces directory entries the manifest never planned for', () => {
    renderDialog([buildStatus()], [buildAccount()], {
      checkedAt: '2026-08-03T01:00:00.000Z',
      claudeVersion: '2.1.220',
      accounts: [
        {
          accountId: 'acct-a',
          label: 'Personal Max',
          email: 'a@example.com',
          outcome: 'verified',
          status: 'connected',
          detail: null,
          unknownEntries: ['credentials-v2'],
          missingLinks: [],
        },
      ],
      settingsWarnings: [],
    })

    expect(screen.getByText(/credentials-v2/)).toBeInTheDocument()
  })
})
