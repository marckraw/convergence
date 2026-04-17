import type { ProviderStatusInfo } from './provider.types'

interface KnownProvider {
  id: string
  name: string
  vendorLabel: string
  binaryName: string
}

const KNOWN_PROVIDERS: KnownProvider[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendorLabel: 'Anthropic',
    binaryName: 'claude',
  },
  {
    id: 'codex',
    name: 'Codex',
    vendorLabel: 'OpenAI',
    binaryName: 'codex',
  },
  {
    id: 'pi',
    name: 'Pi Agent',
    vendorLabel: 'Mario Zechner',
    binaryName: 'pi',
  },
]

export function getKnownProviders(): KnownProvider[] {
  return KNOWN_PROVIDERS
}

export function buildProviderStatus(
  provider: KnownProvider,
  binaryPath: string | null,
  version: string | null = null,
): ProviderStatusInfo {
  if (binaryPath) {
    return {
      id: provider.id,
      name: provider.name,
      vendorLabel: provider.vendorLabel,
      availability: 'available',
      statusLabel: 'Available',
      binaryPath,
      version,
      reason: null,
    }
  }

  return {
    id: provider.id,
    name: provider.name,
    vendorLabel: provider.vendorLabel,
    availability: 'unavailable',
    statusLabel: 'Not found',
    binaryPath: null,
    version: null,
    reason: `${provider.binaryName} is not available on PATH for the app runtime.`,
  }
}
