import {
  decodeExecutionEventEnvelope,
  EXECUTION_PROTOCOL_VERSION,
  type ExecutionHostCommandEnvelope,
  type ExecutionHostEventEnvelope,
  type ExecutionStartRequest,
} from '@mrck-labs/execution-host-protocol'
import type { EndpointHandshakeResult } from '@convergence/execution-host-client'
import type { DaemonStatusView } from '../../../src/shared/studio-api/studio-api.types'

/**
 * Everything Studio derives from the daemon wire without performing any IO
 * (MAR-2770).
 *
 * The requests and the command envelopes are built through the protocol's own
 * types and encoded with its own codecs — `@mrck-labs/execution-host-protocol`
 * is the only public contract for this wire, and a second hand-rolled shape
 * beside it is how a field the daemon started sending goes unread for a
 * release.
 *
 * THIS IS A DUPLICATED SLICE, deliberately and temporarily. Convergence's
 * `remote-execution-host.ts` builds the same three shapes for the same daemon,
 * and the constitution's law 11 says the headless logic should be shared. It is
 * not shared yet because RUN39 is rewriting that file in the other checkout
 * right now; extracting across a live rewrite would be a merge conflict by
 * construction. Duplicated now, extracted in Studio Run 2 — the honest
 * sequence, said out loud rather than discovered later.
 */

export interface StudioStartInput {
  sessionId: string
  providerId: string
  /** The directory on the daemon the Entity works in. */
  workingDirectory: string
  initialMessage: string
}

/**
 * The start request for a Studio conversation.
 *
 * Built field by field rather than by spreading a caller's object: a runtime
 * object can carry more than its type admits, and a start request is not the
 * place to find that out. Everything this run does not own is absent rather
 * than null — `model` and `effort` are `null` because the protocol declares
 * them required and nullable, and null there means "the daemon's choice",
 * which is exactly what constitution law 6 says a v1 user gets.
 */
export function buildStudioStartRequest(
  input: StudioStartInput,
): ExecutionStartRequest {
  return {
    protocolVersion: EXECUTION_PROTOCOL_VERSION,
    providerId: input.providerId,
    config: {
      sessionId: input.sessionId,
      workingDirectory: input.workingDirectory,
      initialMessage: input.initialMessage,
      model: null,
      effort: null,
      continuationToken: null,
    },
  }
}

/** The follow-up a person types into an idle conversation. */
export function buildSendMessageEnvelope(
  sessionId: string,
  text: string,
): ExecutionHostCommandEnvelope {
  return {
    protocolVersion: EXECUTION_PROTOCOL_VERSION,
    sessionId,
    command: { kind: 'send-message', text },
  }
}

/** The stop a person asks for by closing a conversation Studio still follows. */
export function buildStopEnvelope(
  sessionId: string,
): ExecutionHostCommandEnvelope {
  return {
    protocolVersion: EXECUTION_PROTOCOL_VERSION,
    sessionId,
    command: { kind: 'stop' },
  }
}

export type EnvelopeReading =
  | { ok: true; envelope: ExecutionHostEventEnvelope }
  | { ok: false; reason: string }

/**
 * Reads one SSE frame's data as an event envelope, and refuses out loud.
 *
 * The protocol's decoder is the one that reads this wire, so it is the one used
 * here; what this adds is the session check. A frame naming another session is
 * not evidence about this one, and appending it to this conversation's log
 * would put another run's words on a record that never touched it — the same
 * hole `parseRemoteExecutionHostStartResponse` closes at the start door.
 */
export function readEnvelopeFrame(
  data: string,
  expectedSessionId: string,
): EnvelopeReading {
  const decoded = decodeExecutionEventEnvelope(data)
  if (!decoded.ok) {
    return {
      ok: false,
      reason: `daemon sent a frame this build cannot read (${decoded.reason})`,
    }
  }
  if (decoded.value.sessionId !== expectedSessionId) {
    return {
      ok: false,
      reason: `daemon sent a frame for session ${decoded.value.sessionId}, not ${expectedSessionId}`,
    }
  }
  return { ok: true, envelope: decoded.value }
}

/** Joins a daemon base URL and a path without doubling the separator. */
export function daemonUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

/**
 * How long to wait before the next attempt at an event stream.
 *
 * Exponential from one second, capped at thirty. Convergence's number and its
 * reasoning: a remote run usually survives a gateway blip, so giving up early
 * turns a recoverable disconnect into a dead conversation.
 */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt - 1))
}

/**
 * What the handshake means, in the window's vocabulary — and never a cheerier
 * sentence than the status earns.
 *
 * `unreachable`, `unauthorized` and `incompatible` are answers a reader has to
 * be able to tell apart from `connected` at a glance, which is why each has a
 * sentence of its own and none of them borrows the connected one. Carried
 * forward from the seed's `describeHandshakeStatus` (MAR-2737), which this
 * replaces now that Studio performs a real handshake instead of reading a
 * captured body.
 */
export function describeDaemonStatus(
  handshake: EndpointHandshakeResult,
  providerId: string,
): DaemonStatusView {
  const advertisedProviders = Object.keys(handshake.providers).sort()
  return {
    status: handshake.status,
    headline: HANDSHAKE_HEADLINES[handshake.status],
    detail: handshake.detail,
    advertisedProviders,
    // Only a daemon that actually answered can be said to be missing a
    // provider. One that never answered advertises nothing, and reading its
    // silence as "your provider is gone" is a second wrong answer on top of
    // the first.
    providerMissing:
      handshake.status === 'connected' &&
      !advertisedProviders.includes(providerId),
  }
}

const HANDSHAKE_HEADLINES: Record<EndpointHandshakeResult['status'], string> = {
  connected: 'Connected to the daemon.',
  unauthorized: 'The daemon refused the token.',
  incompatible: 'The daemon speaks a protocol this build cannot read.',
  unreachable: 'The daemon did not answer.',
}

/**
 * A failure in one sentence a person can act on.
 *
 * The daemon's own words are preferred over ours wherever it gave any: a start
 * refused with `Unknown provider: claude-code` says the thing that fixes it,
 * and replacing it with "the start failed" throws away the only useful half.
 */
export function describeDaemonFailure(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message.trim()
  }
  return String(error)
}
