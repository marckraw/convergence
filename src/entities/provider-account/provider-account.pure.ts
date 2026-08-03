import type {
  ProviderAccount,
  ProviderAccountAttestationResult,
  ProviderAccountHealth,
  ProviderAccountStatus,
} from './provider-account.types'

/**
 * An account is identity and entitlements, not an anonymous slot, so every
 * label the user reads leads with who it is.
 */
export function describeProviderAccountStatus(status: ProviderAccountStatus): {
  label: string
  tone: 'ok' | 'warning' | 'danger'
} {
  switch (status) {
    case 'connected':
      return { label: 'Connected', tone: 'ok' }
    case 'expired':
      return { label: 'Needs login', tone: 'warning' }
    case 'unavailable':
      return { label: 'Disabled', tone: 'danger' }
  }
}

export interface ProviderAccountHealthSummary {
  /** Accounts attestation disabled because they served the wrong identity. */
  mismatched: ProviderAccountAttestationResult[]
  /** Account-directory entries the manifest did not plan for. */
  unknownEntries: string[]
  /** True when shared settings make account selection decorative. */
  hasSettingsOverride: boolean
}

export function summariseProviderAccountHealth(
  health: ProviderAccountHealth | null,
  accounts: ProviderAccount[],
): ProviderAccountHealthSummary {
  if (!health) {
    return {
      mismatched: [],
      unknownEntries: [],
      hasSettingsOverride: false,
    }
  }

  const known = new Set(accounts.map((account) => account.id))

  return {
    mismatched: health.accounts.filter(
      (result) =>
        result.outcome === 'identity-mismatch' && known.has(result.accountId),
    ),
    unknownEntries: [
      ...new Set(health.accounts.flatMap((result) => result.unknownEntries)),
    ].sort(),
    hasSettingsOverride: health.settingsWarnings.length > 0,
  }
}
