/**
 * COPIED from Emergence — do not edit to taste; re-sync instead.
 *
 *   origin: packages/client-core/src/endpoint/endpoint-handshake.types.ts
 *   repo:   ~/Projects/Private/emergence
 *   commit: 8c79d7f
 *
 * client-core is a private package not meant for release, so this travels as
 * a copy rather than a dependency (MAR-2576). The body below is the origin's,
 * changed only by this repo's Prettier (which broke one union across lines) and
 * by the filename, which took this folder's `execution-host-` prefix. Keep it
 * that way — a copy that stays diffable against upstream can be re-synced; a
 * "tidied" one cannot.
 */
import type { ExecutionProtocolDescriptor } from '@mrck-labs/execution-host-protocol'

export type EndpointConnectionStatus =
  | 'connected'
  | 'unreachable'
  | 'unauthorized'
  | 'incompatible'

/**
 * The two halves behind a provider's readiness boolean, as `/health` reports
 * them since daemon v0.24.10. Additive: a daemon that does not send it leaves
 * this map empty and every client behaves exactly as it did before (MAR-2091).
 */
export interface ProviderReadinessDetail {
  installed: boolean
  authenticated: boolean
}

export interface EndpointHandshakeResult {
  status: EndpointConnectionStatus
  daemonVersion: string | null
  daemonGitSha: string | null
  daemonBuildTime: string | null
  apiVersion: string | null
  uptimeSeconds: number | null
  providers: Record<string, boolean>
  providerReadiness: Record<string, ProviderReadinessDetail>
  executionProtocolCapabilities: string[]
  sessionDirectorySearch: boolean
  transcriptSearch: boolean
  detail: string | null
}

export interface DaemonHealthInfo {
  version: string | null
  gitSha: string | null
  buildTime: string | null
  apiVersion: string | null
  uptimeSeconds: number | null
  providers: Record<string, boolean>
  providerReadiness: Record<string, ProviderReadinessDetail>
  executionProtocol: ExecutionProtocolDescriptor | null
  executionProtocolValid: boolean
  sessionDirectorySearch: boolean
  transcriptSearch: boolean
}

export type MetaProbeOutcome =
  | { kind: 'ok' }
  | { kind: 'http'; httpStatus: number }
  | { kind: 'network-error'; message: string }
  | { kind: 'no-token' }
