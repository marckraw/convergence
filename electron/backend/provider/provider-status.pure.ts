import type {
  ProviderInstallInfo,
  ProviderStatusInfo,
  ProviderUpdateInfo,
  ProviderUpdateStrategy,
} from './provider.types'

export interface KnownProvider {
  id: string
  name: string
  vendorLabel: string
  binaryName: string
  packageName: string
  legacyPackageNames?: string[]
  installCommand: string
  updateCommand: string
  supportsSelfUpdate: boolean
}

const KNOWN_PROVIDERS: KnownProvider[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendorLabel: 'Anthropic',
    binaryName: 'claude',
    packageName: '@anthropic-ai/claude-code',
    installCommand: 'npm install -g @anthropic-ai/claude-code@latest',
    updateCommand: 'claude update',
    supportsSelfUpdate: true,
  },
  {
    id: 'codex',
    name: 'Codex',
    vendorLabel: 'OpenAI',
    binaryName: 'codex',
    packageName: '@openai/codex',
    installCommand: 'npm install -g @openai/codex@latest',
    updateCommand: 'npm install -g @openai/codex@latest',
    supportsSelfUpdate: false,
  },
  {
    id: 'pi',
    name: 'Pi Agent',
    vendorLabel: 'Pi',
    binaryName: 'pi',
    packageName: '@earendil-works/pi-coding-agent',
    legacyPackageNames: ['@mariozechner/pi-coding-agent'],
    installCommand: 'npm install -g @earendil-works/pi-coding-agent@latest',
    updateCommand: 'npm install -g @earendil-works/pi-coding-agent@latest',
    supportsSelfUpdate: false,
  },
]

export function getKnownProviders(): KnownProvider[] {
  return KNOWN_PROVIDERS
}

interface SemverParts {
  major: number
  minor: number
  patch: number
  prerelease: string | null
}

export function extractSemver(value: string | null): string | null {
  return value?.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0] ?? null
}

function parseSemver(value: string | null): SemverParts | null {
  const version = extractSemver(value)
  if (!version) return null

  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
  if (!match) return null

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  }
}

export function compareSemver(left: string, right: string): number | null {
  const leftParts = parseSemver(left)
  const rightParts = parseSemver(right)
  if (!leftParts || !rightParts) return null

  for (const key of ['major', 'minor', 'patch'] as const) {
    const diff = leftParts[key] - rightParts[key]
    if (diff !== 0) return diff
  }

  if (leftParts.prerelease === rightParts.prerelease) return 0
  if (!leftParts.prerelease) return 1
  if (!rightParts.prerelease) return -1
  return leftParts.prerelease.localeCompare(rightParts.prerelease)
}

export function buildProviderUpdateInfo(
  provider: KnownProvider,
  currentVersionOutput: string | null,
  latestVersion: string | null,
  checkError: string | null = null,
  install: ProviderInstallInfo | null = null,
  binaryPath: string | null = null,
): ProviderUpdateInfo {
  const currentVersion = extractSemver(currentVersionOutput)
  const normalizedLatestVersion = extractSemver(latestVersion)
  const comparison =
    currentVersion && normalizedLatestVersion
      ? compareSemver(currentVersion, normalizedLatestVersion)
      : null

  const strategy = resolveProviderUpdateStrategy(provider, install, binaryPath)

  return {
    currentVersion,
    latestVersion: normalizedLatestVersion,
    status:
      comparison === null ? 'unknown' : comparison < 0 ? 'outdated' : 'current',
    packageName: provider.packageName,
    installCommand: provider.installCommand,
    updateCommand: provider.updateCommand,
    manualUpdateCommand: provider.updateCommand,
    automaticUpdateCommand: strategy.command,
    updateCapability: strategy.strategy ? 'automatic' : 'manual',
    updateStrategy: strategy.strategy,
    checkError,
  }
}

export function resolveProviderUpdateStrategy(
  provider: KnownProvider,
  install: ProviderInstallInfo | null,
  binaryPath: string | null,
): { strategy: ProviderUpdateStrategy; command: string | null } {
  if (install?.manager === 'npm' && install.npmPath) {
    if (
      install.packageName &&
      install.packageName !== provider.packageName &&
      provider.legacyPackageNames?.includes(install.packageName)
    ) {
      return {
        strategy: 'npm-global',
        command: `${install.npmPath} uninstall -g ${install.packageName} && ${install.npmPath} install -g ${provider.packageName}@latest`,
      }
    }

    return {
      strategy: 'npm-global',
      command: `${install.npmPath} install -g ${provider.packageName}@latest`,
    }
  }

  if (
    provider.supportsSelfUpdate &&
    binaryPath &&
    install?.manager !== 'homebrew'
  ) {
    return {
      strategy: 'provider-self-update',
      command: `${binaryPath} update`,
    }
  }

  return {
    strategy: null,
    command: null,
  }
}

export function buildProviderStatus(
  provider: KnownProvider,
  binaryPath: string | null,
  version: string | null = null,
  latestVersion: string | null = null,
  updateCheckError: string | null = null,
  install: ProviderInstallInfo | null = null,
): ProviderStatusInfo {
  const update = buildProviderUpdateInfo(
    provider,
    version,
    latestVersion,
    updateCheckError,
    install,
    binaryPath,
  )

  if (binaryPath) {
    return {
      id: provider.id,
      name: provider.name,
      vendorLabel: provider.vendorLabel,
      availability: 'available',
      statusLabel: 'Available',
      binaryPath,
      install,
      version,
      reason: null,
      update,
    }
  }

  return {
    id: provider.id,
    name: provider.name,
    vendorLabel: provider.vendorLabel,
    availability: 'unavailable',
    statusLabel: 'Not found',
    binaryPath: null,
    install: null,
    version: null,
    reason: `${provider.binaryName} is not available on PATH for the app runtime.`,
    update,
  }
}
