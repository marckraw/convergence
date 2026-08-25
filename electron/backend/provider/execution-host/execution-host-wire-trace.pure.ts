import type {
  ExecutionActivitySignal,
  ExecutionAttentionState,
  ExecutionHostEvent,
  ExecutionSessionDelta,
  ExecutionSessionStatus,
  ExecutionTurnStatus,
} from '@mrck-labs/execution-host-protocol'

/**
 * Redacted descriptions of execution-host wire traffic, for the session debug
 * log.
 *
 * A remote session is the one execution path whose provider runs on another
 * machine, so the wire is the only place its behaviour can be observed. These
 * describers make that observable without making it dangerous: they carry
 * kinds, enum values, and sizes, and never the payloads themselves.
 *
 * The rule is whitelist, not blacklist — a field reaches a shape only by being
 * named here. Continuation tokens, message text, thinking text, tool inputs and
 * outputs, approval descriptions, notes, turn summaries, file paths and diffs
 * therefore all stay behind, including any field a future protocol version
 * adds.
 */

/**
 * Continuation tokens are credentials for a provider conversation, so the trace
 * describes one instead of quoting it: enough to tell "the daemon sent a
 * plausible token" from "the daemon sent an empty string", and nothing more.
 */
export interface WireTokenShape {
  chars: number
  form: 'uuid' | 'opaque'
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function describeWireTokenShape(token: string): WireTokenShape {
  return {
    chars: token.length,
    form: UUID_PATTERN.test(token) ? 'uuid' : 'opaque',
  }
}

export interface WireDeltaShape {
  kind: ExecutionSessionDelta['kind']
  /** Which fields a patch carried — the question a patch trace exists to answer. */
  patchFields?: string[]
  status?: ExecutionSessionStatus
  attention?: ExecutionAttentionState
  activity?: ExecutionActivitySignal
  /** Null when the patch explicitly cleared the token. */
  continuationToken?: WireTokenShape | null
  itemKind?: string
  itemState?: string
  actor?: string
  textChars?: number
  textAppendChars?: number
  turnStatus?: ExecutionTurnStatus
  fileChangeCount?: number
}

export function describeWireDeltaShape(
  delta: ExecutionSessionDelta,
): WireDeltaShape {
  switch (delta.kind) {
    case 'session.patch': {
      const patch = delta.patch
      return {
        kind: delta.kind,
        patchFields: Object.keys(patch),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.attention !== undefined
          ? { attention: patch.attention }
          : {}),
        ...(patch.activity !== undefined ? { activity: patch.activity } : {}),
        ...(patch.continuationToken !== undefined
          ? {
              continuationToken:
                patch.continuationToken === null
                  ? null
                  : describeWireTokenShape(patch.continuationToken),
            }
          : {}),
      }
    }
    case 'conversation.item.add': {
      const item = delta.item
      return {
        kind: delta.kind,
        itemKind: item.kind,
        itemState: item.state,
        ...('actor' in item ? { actor: item.actor } : {}),
        ...('text' in item ? { textChars: item.text.length } : {}),
      }
    }
    case 'conversation.item.patch': {
      // Read through an untyped view: the patch is a distributed union over
      // every item kind, so `text` and friends exist on some members only.
      const patch = delta.patch as Record<string, unknown>
      const state = patch.state
      const text = patch.text
      const textAppend = patch.textAppend
      return {
        kind: delta.kind,
        patchFields: Object.keys(patch),
        ...(typeof state === 'string' ? { itemState: state } : {}),
        ...(typeof text === 'string' ? { textChars: text.length } : {}),
        ...(typeof textAppend === 'string'
          ? { textAppendChars: textAppend.length }
          : {}),
      }
    }
    case 'turn.add':
      return { kind: delta.kind, turnStatus: delta.turn.status }
    case 'turn.patch':
      return {
        kind: delta.kind,
        patchFields: Object.keys(delta.patch),
        ...(delta.patch.status !== undefined
          ? { turnStatus: delta.patch.status }
          : {}),
      }
    case 'turn.fileChanges.add':
      return { kind: delta.kind, fileChangeCount: delta.fileChanges.length }
  }
}

export interface WireEventShape {
  kind: ExecutionHostEvent['kind']
  status?: ExecutionSessionStatus
  attention?: ExecutionAttentionState
  activity?: ExecutionActivitySignal
  continuationToken?: WireTokenShape
  contextWindow?: { availability: string; source: string }
  delta?: WireDeltaShape
}

export function describeWireEventShape(
  event: ExecutionHostEvent,
): WireEventShape {
  switch (event.kind) {
    case 'delta':
      return { kind: event.kind, delta: describeWireDeltaShape(event.delta) }
    case 'status':
      return { kind: event.kind, status: event.status }
    case 'attention':
      return { kind: event.kind, attention: event.attention }
    case 'continuation-token':
      return {
        kind: event.kind,
        continuationToken: describeWireTokenShape(event.token),
      }
    case 'context-window':
      return {
        kind: event.kind,
        contextWindow: {
          availability: event.contextWindow.availability,
          source: event.contextWindow.source,
        },
      }
    case 'activity':
      return { kind: event.kind, activity: event.activity }
    case 'heartbeat':
      return { kind: event.kind }
  }
}
