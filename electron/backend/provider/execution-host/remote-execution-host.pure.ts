import type { ProviderDescriptor, SessionStartConfig } from '../provider.types'
import type { ExecutionHostStartRequest } from './execution-host-protocol.types'
import { EXECUTION_HOST_PROTOCOL_VERSION } from './execution-host-protocol.types'
import type { ExecutionHostProviderCapabilities } from './execution-host.types'
import {
  RemoteExecutionHostError,
  type RemoteExecutionHostProviderInfo,
} from './remote-execution-host.types'

/**
 * Parses the daemon /v0/meta response into the provider slice the Remote
 * Execution Host consumes. Throws RemoteExecutionHostError('malformed') when
 * the response does not carry a well-formed provider listing.
 */
export function parseRemoteExecutionHostMeta(
  value: unknown,
): RemoteExecutionHostProviderInfo[] {
  if (!isRecord(value) || !Array.isArray(value.providers)) {
    throw new RemoteExecutionHostError(
      'Remote daemon meta response is missing a provider listing.',
      'malformed',
    )
  }

  return value.providers.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      typeof entry.label !== 'string' ||
      typeof entry.available !== 'boolean' ||
      typeof entry.authenticated !== 'boolean'
    ) {
      throw new RemoteExecutionHostError(
        'Remote daemon meta response carries a malformed provider entry.',
        'malformed',
      )
    }

    const features = isRecord(entry.features) ? entry.features : {}
    const models = Array.isArray(entry.models) ? entry.models : []

    return {
      providerId: entry.id,
      name: entry.label,
      available: entry.available,
      authenticated: entry.authenticated,
      supportsContinuation: features.resume === true,
      models: models.flatMap((model) => {
        if (!isRecord(model) || typeof model.slug !== 'string') return []
        return [
          {
            id: model.slug,
            label: typeof model.label === 'string' ? model.label : model.slug,
          },
        ]
      }),
    }
  })
}

/**
 * Capability summary for one remote provider. One-shot execution has no wire
 * endpoint yet, so remote providers never advertise it.
 */
export function capabilitiesForRemoteProvider(
  info: RemoteExecutionHostProviderInfo,
): ExecutionHostProviderCapabilities {
  return {
    providerId: info.providerId,
    name: info.name,
    supportsContinuation: info.supportsContinuation,
    supportsOneShot: false,
  }
}

/**
 * Synthesizes a ProviderDescriptor from the daemon provider listing. The
 * daemon does not transport full descriptor metadata, so capability fields
 * default to the conservative remote baseline: follow-up mid-run input only
 * and no attachment ingestion (byte transfer lands with MAR-1415).
 */
export function descriptorForRemoteProvider(
  info: RemoteExecutionHostProviderInfo,
): ProviderDescriptor {
  return {
    id: info.providerId,
    name: info.name,
    vendorLabel: 'Remote daemon',
    kind: 'conversation',
    supportsContinuation: info.supportsContinuation,
    defaultModelId: info.models[0]?.id ?? '',
    modelOptions: info.models.map((model) => ({
      id: model.id,
      label: model.label,
      defaultEffort: null,
      effortOptions: [],
      source: 'provider' as const,
    })),
    attachments: {
      supportsImage: false,
      supportsPdf: false,
      supportsText: false,
      maxImageBytes: 0,
      maxPdfBytes: 0,
      maxTextBytes: 0,
      maxTotalBytes: 0,
    },
    midRunInput: {
      supportsAnswer: false,
      supportsNativeFollowUp: true,
      supportsAppQueuedFollowUp: false,
      supportsSteer: false,
      supportsInterrupt: true,
      defaultRunningMode: 'follow-up',
    },
  }
}

export function buildRemoteExecutionHostStartRequest(
  providerId: string,
  config: SessionStartConfig,
): ExecutionHostStartRequest {
  return {
    protocolVersion: EXECUTION_HOST_PROTOCOL_VERSION,
    providerId,
    config,
    ...(config.workspace ? { workspace: config.workspace } : {}),
  }
}

/**
 * Maps a local provider registry id to the provider id the remote daemon
 * advertises, or null when the provider has no remote counterpart. The two
 * registries grew separate namespaces (`claude-code` locally, `claude` on the
 * daemon); sessions always store the local id and translate at the host
 * boundary.
 */
export function remoteProviderIdForLocalProvider(
  localProviderId: string,
): string | null {
  switch (localProviderId) {
    case 'claude-code':
      return 'claude'
    case 'codex':
      return 'codex'
    case 'cursor':
      return 'cursor'
    default:
      return null
  }
}

/** Parses the daemon start response and pins the echoed session id. */
export function parseRemoteExecutionHostStartResponse(value: unknown): {
  sessionId: string
} {
  if (!isRecord(value) || typeof value.sessionId !== 'string') {
    throw new RemoteExecutionHostError(
      'Remote daemon returned a malformed start response.',
      'malformed',
    )
  }
  return { sessionId: value.sessionId }
}

export interface SseEvent {
  id: string | null
  data: string
}

/**
 * Incremental parser for a text/event-stream byte stream. Feed decoded
 * chunks in arrival order; complete events (terminated by a blank line) are
 * returned as they form. Comment lines and unknown fields are ignored;
 * multiple data lines join with newlines per the SSE specification.
 */
export function createSseParser(): { feed: (chunk: string) => SseEvent[] } {
  let buffer = ''
  let dataLines: string[] = []
  let id: string | null = null

  return {
    feed(chunk: string): SseEvent[] {
      buffer += chunk
      const events: SseEvent[] = []

      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '')
        buffer = buffer.slice(newlineIndex + 1)
        newlineIndex = buffer.indexOf('\n')

        if (line === '') {
          if (dataLines.length > 0) {
            events.push({ id, data: dataLines.join('\n') })
          }
          dataLines = []
          id = null
          continue
        }
        if (line.startsWith(':')) continue

        const colonIndex = line.indexOf(':')
        const field = colonIndex === -1 ? line : line.slice(0, colonIndex)
        let fieldValue = colonIndex === -1 ? '' : line.slice(colonIndex + 1)
        if (fieldValue.startsWith(' ')) fieldValue = fieldValue.slice(1)

        if (field === 'data') dataLines.push(fieldValue)
        else if (field === 'id') id = fieldValue
      }

      return events
    },
  }
}

/**
 * Renders a remote failure for the conversation note: the underlying
 * message, the HTTP status when one exists, and an actionable hint derived
 * from the error kind so users can self-diagnose without daemon log access.
 */
export function describeRemoteExecutionHostFailure(error: unknown): string {
  const base = error instanceof Error ? error.message : String(error)
  if (!(error instanceof RemoteExecutionHostError)) return base
  const status = error.status ? ` (HTTP ${error.status})` : ''
  const hint = remoteFailureHint(error.kind)
  return `${base}${status}${hint ? ` ${hint}` : ''}`
}

function remoteFailureHint(
  kind: RemoteExecutionHostError['kind'],
): string | null {
  switch (kind) {
    case 'configuration':
      return 'Configure the daemon in Settings under Remote execution host.'
    case 'auth':
      return 'The daemon rejected the API token; update it in Settings under Remote execution host.'
    case 'network':
      return 'The daemon is unreachable; verify it with Test connection in Settings under Remote execution host.'
    case 'malformed':
      return 'The daemon sent an unexpected response; it may need an update.'
    case 'http':
      return null
  }
}

const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 30_000

/** Exponential backoff for SSE reconnects: 1s, 2s, 4s, ... capped at 30s. */
export function remoteExecutionHostReconnectDelayMs(attempt: number): number {
  const exponent = Math.max(0, attempt - 1)
  return Math.min(
    RECONNECT_BASE_DELAY_MS * 2 ** exponent,
    RECONNECT_MAX_DELAY_MS,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
