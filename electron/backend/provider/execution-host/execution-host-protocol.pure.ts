import {
  EXECUTION_HOST_PROTOCOL_VERSION,
  type ExecutionHostCommand,
  type ExecutionHostCommandEnvelope,
  type ExecutionHostEvent,
  type ExecutionHostEventEnvelope,
  type ExecutionHostStartRequest,
} from './execution-host-protocol.types'

export type ExecutionHostDecodeFailureReason =
  | 'malformed-json'
  | 'unsupported-protocol-version'
  | 'invalid-envelope'
  | 'unknown-kind'
  | 'invalid-payload'

export type ExecutionHostDecodeResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: ExecutionHostDecodeFailureReason }

const SESSION_STATUSES = new Set(['idle', 'running', 'completed', 'failed'])
const ATTENTION_STATES = new Set([
  'none',
  'needs-input',
  'needs-approval',
  'finished',
  'failed',
])
const ACTIVITY_SIGNALS = new Set([
  'streaming',
  'thinking',
  'compacting',
  'waiting-approval',
])
const COMMAND_KINDS = new Set(['send-message', 'approve', 'deny', 'stop'])
const EVENT_KINDS = new Set([
  'delta',
  'status',
  'attention',
  'continuation-token',
  'context-window',
  'activity',
  'heartbeat',
])

export function encodeExecutionHostEventEnvelope(
  envelope: ExecutionHostEventEnvelope,
): string {
  return JSON.stringify(envelope)
}

export function encodeExecutionHostCommandEnvelope(
  envelope: ExecutionHostCommandEnvelope,
): string {
  return JSON.stringify(envelope)
}

export function encodeExecutionHostStartRequest(
  request: ExecutionHostStartRequest,
): string {
  return JSON.stringify(request)
}

export function decodeExecutionHostEventEnvelope(
  raw: string,
): ExecutionHostDecodeResult<ExecutionHostEventEnvelope> {
  const parsed = parseEnvelopeBase(raw)
  if (!parsed.ok) return parsed

  const candidate = parsed.value as {
    sessionId?: unknown
    seq?: unknown
    event?: unknown
  }
  if (
    typeof candidate.sessionId !== 'string' ||
    typeof candidate.seq !== 'number' ||
    !Number.isInteger(candidate.seq) ||
    candidate.seq < 1
  ) {
    return { ok: false, reason: 'invalid-envelope' }
  }

  const event = validateEvent(candidate.event)
  if (!event.ok) return event

  return {
    ok: true,
    value: {
      protocolVersion: EXECUTION_HOST_PROTOCOL_VERSION,
      sessionId: candidate.sessionId,
      seq: candidate.seq,
      event: event.value,
    },
  }
}

export function decodeExecutionHostCommandEnvelope(
  raw: string,
): ExecutionHostDecodeResult<ExecutionHostCommandEnvelope> {
  const parsed = parseEnvelopeBase(raw)
  if (!parsed.ok) return parsed

  const candidate = parsed.value as { sessionId?: unknown; command?: unknown }
  if (typeof candidate.sessionId !== 'string') {
    return { ok: false, reason: 'invalid-envelope' }
  }

  const command = validateCommand(candidate.command)
  if (!command.ok) return command

  return {
    ok: true,
    value: {
      protocolVersion: EXECUTION_HOST_PROTOCOL_VERSION,
      sessionId: candidate.sessionId,
      command: command.value,
    },
  }
}

export function decodeExecutionHostStartRequest(
  raw: string,
): ExecutionHostDecodeResult<ExecutionHostStartRequest> {
  const parsed = parseEnvelopeBase(raw)
  if (!parsed.ok) return parsed

  const candidate = parsed.value as { providerId?: unknown; config?: unknown }
  if (
    typeof candidate.providerId !== 'string' ||
    !isRecord(candidate.config) ||
    typeof candidate.config.sessionId !== 'string' ||
    typeof candidate.config.workingDirectory !== 'string' ||
    typeof candidate.config.initialMessage !== 'string'
  ) {
    return { ok: false, reason: 'invalid-envelope' }
  }

  return {
    ok: true,
    value: {
      protocolVersion: EXECUTION_HOST_PROTOCOL_VERSION,
      providerId: candidate.providerId,
      config:
        candidate.config as unknown as ExecutionHostStartRequest['config'],
    },
  }
}

function parseEnvelopeBase(
  raw: string,
): ExecutionHostDecodeResult<Record<string, unknown>> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'malformed-json' }
  }

  if (!isRecord(parsed)) return { ok: false, reason: 'invalid-envelope' }
  if (parsed.protocolVersion !== EXECUTION_HOST_PROTOCOL_VERSION) {
    return { ok: false, reason: 'unsupported-protocol-version' }
  }
  return { ok: true, value: parsed }
}

function validateEvent(
  candidate: unknown,
): ExecutionHostDecodeResult<ExecutionHostEvent> {
  if (!isRecord(candidate)) return { ok: false, reason: 'invalid-envelope' }
  const kind = candidate.kind
  if (typeof kind !== 'string' || !EVENT_KINDS.has(kind)) {
    return { ok: false, reason: 'unknown-kind' }
  }

  switch (kind) {
    case 'delta':
      if (!isRecord(candidate.delta)) {
        return { ok: false, reason: 'invalid-payload' }
      }
      break
    case 'status':
      if (
        typeof candidate.status !== 'string' ||
        !SESSION_STATUSES.has(candidate.status)
      ) {
        return { ok: false, reason: 'invalid-payload' }
      }
      break
    case 'attention':
      if (
        typeof candidate.attention !== 'string' ||
        !ATTENTION_STATES.has(candidate.attention)
      ) {
        return { ok: false, reason: 'invalid-payload' }
      }
      break
    case 'continuation-token':
      if (typeof candidate.token !== 'string') {
        return { ok: false, reason: 'invalid-payload' }
      }
      break
    case 'context-window':
      if (!isRecord(candidate.contextWindow)) {
        return { ok: false, reason: 'invalid-payload' }
      }
      break
    case 'activity':
      if (!isValidActivitySignal(candidate.activity)) {
        return { ok: false, reason: 'invalid-payload' }
      }
      break
    case 'heartbeat':
      break
  }

  return { ok: true, value: candidate as unknown as ExecutionHostEvent }
}

function validateCommand(
  candidate: unknown,
): ExecutionHostDecodeResult<ExecutionHostCommand> {
  if (!isRecord(candidate)) return { ok: false, reason: 'invalid-envelope' }
  const kind = candidate.kind
  if (typeof kind !== 'string' || !COMMAND_KINDS.has(kind)) {
    return { ok: false, reason: 'unknown-kind' }
  }

  if (kind === 'send-message' && typeof candidate.text !== 'string') {
    return { ok: false, reason: 'invalid-payload' }
  }
  if (
    (kind === 'approve' || kind === 'deny') &&
    candidate.providerApprovalId !== undefined &&
    typeof candidate.providerApprovalId !== 'string'
  ) {
    return { ok: false, reason: 'invalid-payload' }
  }

  return { ok: true, value: candidate as unknown as ExecutionHostCommand }
}

function isValidActivitySignal(value: unknown): boolean {
  if (value === null) return true
  if (typeof value !== 'string') return false
  return ACTIVITY_SIGNALS.has(value) || value.startsWith('tool:')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
