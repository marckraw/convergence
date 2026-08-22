/**
 * COPIED from Emergence — do not edit to taste; re-sync instead.
 *
 *   origin: packages/client-core/src/endpoint/endpoint-handshake.pure.ts
 *   repo:   ~/Projects/Private/emergence
 *   commit: 8c79d7f
 *
 * client-core is a private package not meant for release, so this travels as
 * a copy rather than a dependency (MAR-2576). The body below is byte-identical
 * to the origin apart from the sibling import path, which follows the renamed
 * types file. Keep it that way — a copy that stays diffable against upstream
 * can be re-synced; a "tidied" one cannot.
 */
import { decodeExecutionProtocolDescriptor } from '@mrck-labs/execution-host-protocol'
import type {
  DaemonHealthInfo,
  EndpointHandshakeResult,
  MetaProbeOutcome,
  ProviderReadinessDetail,
} from './execution-host-handshake.types'

/**
 * Daemon API versions this app can talk to. Older daemons without the additive
 * executionProtocol descriptor still negotiate through this coarse API version.
 */
export const SUPPORTED_DAEMON_API_VERSIONS: readonly string[] = ['v0']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseProviderAvailability(raw: unknown): Record<string, boolean> {
  if (!isRecord(raw)) return {}

  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
    ),
  )
}

/**
 * `providerReadiness.<id> = {installed, authenticated}` arrived additively in
 * daemon v0.24.10. Anything unreadable is simply left out rather than guessed
 * at, so an older daemon — or a newer one that changes its mind — degrades to
 * the flat boolean list clients already understand (MAR-2091).
 */
function parseProviderReadiness(
  raw: unknown,
): Record<string, ProviderReadinessDetail> {
  if (!isRecord(raw)) return {}

  const entries: [string, ProviderReadinessDetail][] = []
  for (const [providerId, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue
    if (
      typeof value.installed !== 'boolean' ||
      typeof value.authenticated !== 'boolean'
    ) {
      continue
    }
    entries.push([
      providerId,
      { installed: value.installed, authenticated: value.authenticated },
    ])
  }
  return Object.fromEntries(entries)
}

function parseSessionDirectoryCapabilities(raw: unknown): {
  search: boolean
} {
  if (!isRecord(raw)) return { search: false }
  return {
    search: raw.search === true,
  }
}

function parseTranscriptSearchCapability(raw: unknown): boolean {
  return isRecord(raw) && raw.search === true
}

/** Defensive parse of GET /health. Returns null when the shape is not a daemon. */
export function parseDaemonHealth(raw: unknown): DaemonHealthInfo | null {
  if (!isRecord(raw) || raw.status !== 'ok') return null
  const hasExecutionProtocol = raw.executionProtocol !== undefined
  const executionProtocol = decodeExecutionProtocolDescriptor(
    raw.executionProtocol,
  )
  const sessionDirectory = parseSessionDirectoryCapabilities(
    raw.sessionDirectory,
  )
  return {
    version: typeof raw.version === 'string' ? raw.version : null,
    gitSha: typeof raw.gitSha === 'string' ? raw.gitSha : null,
    buildTime: typeof raw.buildTime === 'string' ? raw.buildTime : null,
    apiVersion: typeof raw.apiVersion === 'string' ? raw.apiVersion : null,
    uptimeSeconds:
      typeof raw.uptime === 'number' && Number.isFinite(raw.uptime)
        ? raw.uptime
        : null,
    providers: parseProviderAvailability(raw.providers),
    providerReadiness: parseProviderReadiness(raw.providerReadiness),
    executionProtocol: executionProtocol.ok ? executionProtocol.value : null,
    executionProtocolValid: !hasExecutionProtocol || executionProtocol.ok,
    sessionDirectorySearch: sessionDirectory.search,
    transcriptSearch: parseTranscriptSearchCapability(raw.transcriptSearch),
  }
}

export function evaluateHandshake(
  health: DaemonHealthInfo | null,
  healthFailure: string | null,
  meta: MetaProbeOutcome,
): EndpointHandshakeResult {
  if (health === null) {
    return {
      status: 'unreachable',
      daemonVersion: null,
      daemonGitSha: null,
      daemonBuildTime: null,
      apiVersion: null,
      uptimeSeconds: null,
      providers: {},
      providerReadiness: {},
      executionProtocolCapabilities: [],
      sessionDirectorySearch: false,
      transcriptSearch: false,
      detail: healthFailure ?? 'Daemon did not answer /health',
    }
  }

  const base = {
    daemonVersion: health.version,
    daemonGitSha: health.gitSha,
    daemonBuildTime: health.buildTime,
    apiVersion: health.apiVersion,
    uptimeSeconds: health.uptimeSeconds,
    providers: health.providers,
    providerReadiness: health.providerReadiness,
    executionProtocolCapabilities: health.executionProtocol?.capabilities ?? [],
    sessionDirectorySearch: health.sessionDirectorySearch,
    transcriptSearch: health.transcriptSearch,
  }

  if (
    !health.executionProtocolValid ||
    health.apiVersion === null ||
    !SUPPORTED_DAEMON_API_VERSIONS.includes(health.apiVersion)
  ) {
    return {
      ...base,
      status: 'incompatible',
      detail: !health.executionProtocolValid
        ? 'Daemon execution protocol is incompatible with this app'
        : `Daemon apiVersion ${health.apiVersion ?? 'unknown'} not in supported [${SUPPORTED_DAEMON_API_VERSIONS.join(', ')}]`,
    }
  }

  switch (meta.kind) {
    case 'ok':
      return { ...base, status: 'connected', detail: null }
    case 'no-token':
      return {
        ...base,
        status: 'unauthorized',
        detail: 'No token configured for this endpoint',
      }
    case 'http':
      if (meta.httpStatus === 401 || meta.httpStatus === 403) {
        return {
          ...base,
          status: 'unauthorized',
          detail: 'Daemon rejected the token',
        }
      }
      return {
        ...base,
        status: 'unreachable',
        detail: `Authenticated probe failed with HTTP ${meta.httpStatus}`,
      }
    case 'network-error':
      return {
        ...base,
        status: 'unreachable',
        detail: `Authenticated probe failed: ${meta.message}`,
      }
  }
}
