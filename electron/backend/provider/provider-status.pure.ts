import type { ProviderStatusInfo, ProviderUpdateInfo } from './provider.types'

interface KnownProvider {
  id: string
  name: string
  vendorLabel: string
  binaryName: string
  packageName: string
  installCommand: string
  updateCommand: string
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
  },
  {
    id: 'codex',
    name: 'Codex',
    vendorLabel: 'OpenAI',
    binaryName: 'codex',
    packageName: '@openai/codex',
    installCommand: 'npm install -g @openai/codex@latest',
    updateCommand: 'codex --upgrade',
  },
  {
    id: 'pi',
    name: 'Pi Agent',
    vendorLabel: 'Pi',
    binaryName: 'pi',
    packageName: '@mariozechner/pi-coding-agent',
    installCommand: 'npm install -g @mariozechner/pi-coding-agent@latest',
    updateCommand: 'npm update -g @mariozechner/pi-coding-agent',
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
): ProviderUpdateInfo {
  const currentVersion = extractSemver(currentVersionOutput)
  const normalizedLatestVersion = extractSemver(latestVersion)
  const comparison =
    currentVersion && normalizedLatestVersion
      ? compareSemver(currentVersion, normalizedLatestVersion)
      : null

  return {
    currentVersion,
    latestVersion: normalizedLatestVersion,
    status:
      comparison === null ? 'unknown' : comparison < 0 ? 'outdated' : 'current',
    packageName: provider.packageName,
    installCommand: provider.installCommand,
    updateCommand: provider.updateCommand,
    checkError,
  }
}

export function buildProviderStatus(
  provider: KnownProvider,
  binaryPath: string | null,
  version: string | null = null,
  latestVersion: string | null = null,
  updateCheckError: string | null = null,
): ProviderStatusInfo {
  const update = buildProviderUpdateInfo(
    provider,
    version,
    latestVersion,
    updateCheckError,
  )

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
    version: null,
    reason: `${provider.binaryName} is not available on PATH for the app runtime.`,
    update,
  }
}
