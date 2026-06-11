import type {
  InteractionResponse,
  SessionDelta,
} from '../../session/conversation-item.types'
import type { SkillSelection } from '../../skills/skills.types'
import type {
  ActivitySignal,
  Attachment,
  AttentionState,
  MidRunInputMode,
  SessionContextWindow,
  SessionStartConfig,
  SessionStatus,
} from '../provider.types'

/**
 * Wire protocol for driving a remote Provider Execution Host. The protocol
 * serializes the SessionHandle interaction from provider.types: client to
 * host commands on one side, host to client events on the other.
 *
 * The envelope types here are transport-agnostic JSON. The chosen transport
 * (SSE event stream plus posted commands, see
 * docs/architecture/execution-host-wire-protocol.md and ADR 0006) can be
 * swapped without changing these shapes.
 */
export const EXECUTION_HOST_PROTOCOL_VERSION = 1

/**
 * Body of the request that starts a Session run on a remote host. Mirrors
 * ProviderExecutionHost.start. `config.initialAttachments` carry host-local
 * storage paths; byte transfer happens before start (MAR-1415).
 */
export interface ExecutionHostStartRequest {
  protocolVersion: typeof EXECUTION_HOST_PROTOCOL_VERSION
  providerId: string
  config: SessionStartConfig
}

export interface ExecutionHostSendMessageOptions {
  deliveryMode: MidRunInputMode
  queuedInputId?: string | null
  expectedProviderTurnId?: string | null
  interactionResponse?: InteractionResponse
}

/** Client to host: the serialized form of the SessionHandle command methods. */
export type ExecutionHostCommand =
  | {
      kind: 'send-message'
      text: string
      attachments?: Attachment[]
      skillSelections?: SkillSelection[]
      options?: ExecutionHostSendMessageOptions
    }
  | { kind: 'approve'; providerApprovalId?: string }
  | { kind: 'deny'; providerApprovalId?: string }
  | { kind: 'stop' }

export interface ExecutionHostCommandEnvelope {
  protocolVersion: typeof EXECUTION_HOST_PROTOCOL_VERSION
  sessionId: string
  command: ExecutionHostCommand
}

/** Host to client: the serialized form of the SessionHandle event listeners. */
export type ExecutionHostEvent =
  | { kind: 'delta'; delta: SessionDelta }
  | { kind: 'status'; status: SessionStatus }
  | { kind: 'attention'; attention: AttentionState }
  | { kind: 'continuation-token'; token: string }
  | { kind: 'context-window'; contextWindow: SessionContextWindow }
  | { kind: 'activity'; activity: ActivitySignal }
  | { kind: 'heartbeat' }

/**
 * One host to client event. `seq` increases by exactly one per Session,
 * starting at 1; clients resume a dropped stream by sending the last seq
 * they processed and the host replays everything after it.
 */
export interface ExecutionHostEventEnvelope {
  protocolVersion: typeof EXECUTION_HOST_PROTOCOL_VERSION
  sessionId: string
  seq: number
  event: ExecutionHostEvent
}
