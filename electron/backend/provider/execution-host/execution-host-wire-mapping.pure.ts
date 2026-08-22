import {
  EXECUTION_PROTOCOL_VERSION,
  type ExecutionConversationItem,
  type ExecutionConversationItemPatch,
  type ExecutionHostCommand,
  type ExecutionSessionDelta,
  type ExecutionStartConfig,
  type ExecutionStartRequest,
} from '@mrck-labs/execution-host-protocol'
import type {
  ConversationItem,
  ConversationItemDraft,
  InteractionResponse,
  SessionDelta,
} from '../../session/conversation-item.types'
import type { SkillSelection } from '../../skills/skills.types'
import type {
  Attachment,
  MidRunInputMode,
  SessionStartConfig,
} from '../provider.types'

/**
 * Anti-corruption layer between Convergence's local session model and the
 * `@mrck-labs/execution-host-protocol` wire contract (ADR 0006, MAR-2576).
 *
 * The two models are deliberately not the same type. The wire is the shared
 * fleet contract that the agents-daemon and Emergence also speak; the local
 * model carries Convergence-only concerns (provider accounts, skill
 * selections, attachment ids) that have no home on it. Translating explicitly
 * here — rather than casting a local type onto the wire — is what makes every
 * field Convergence cannot transport a named, tested constant instead of a
 * silent omission.
 */

/**
 * Local `SessionStartConfig` fields with no home on the wire
 * `ExecutionStartConfig`.
 *
 * These are not a regression: the daemon reconstructs the start config
 * field-by-field in its own decoder, so it has always discarded every one of
 * them on arrival. Naming them here makes the loss inspectable, and gives the
 * later slices of the Remote Endpoints era an explicit list to close.
 *
 * - `initialAttachments` — local storage paths for bytes that were never
 *   transferred to the host. The wire's `inlineAttachments` is a different
 *   shape (base64 image payloads) that Convergence does not produce yet
 *   (MAR-1415).
 * - `initialSkillSelections` — the wire start config carries no skill
 *   selection; skills reach a remote run only through send-message.
 * - `previousAssistantTexts` — priming context for local relay and fork
 *   flows, which the daemon neither models nor needs.
 * - `serviceTier` — a Convergence-local provider billing preference.
 * - `providerAccountId` — Convergence's own multi-account concept (ADR 0007).
 *   A remote run authenticates as the daemon's account, not as one of ours.
 */
export const EXECUTION_HOST_UNMAPPED_START_CONFIG_FIELDS = [
  'initialAttachments',
  'initialSkillSelections',
  'previousAssistantTexts',
  'serviceTier',
  'providerAccountId',
] as const satisfies readonly (keyof SessionStartConfig)[]

/**
 * Wire delta kinds Convergence receives but has no local delta for, so the
 * mapping returns null and the session never sees them.
 *
 * `turn.patch` closes a turn record the local session model does not keep for
 * remote runs — local turns are written by the turn-capture service, never
 * from the wire. Dropping it matches what the session service already did with
 * it: `applyDelta` has no branch for the kind.
 */
export const EXECUTION_HOST_UNMAPPED_WIRE_DELTA_KINDS = [
  'turn.patch',
] as const satisfies readonly ExecutionSessionDelta['kind'][]

/**
 * Wire fields dropped when a wire conversation item or item patch becomes a
 * local one.
 *
 * - `attachments` — wire attachment descriptors. The local item stores
 *   `attachmentIds` resolved against Convergence's own attachment store, which
 *   a daemon-side id cannot address (MAR-1415).
 * - `delivery` — the daemon's queued/delivered/undelivered lifecycle for a
 *   user message. The local `deliveryMode` is a different concept (how the
 *   composer sent the text), so this has no local reader.
 * - `textAppend` — incremental text, sent only to a subscriber that negotiates
 *   `?deltas=append`. Convergence does not, so the daemon strips it before the
 *   envelope is written and full `text` always arrives instead.
 */
export const EXECUTION_HOST_UNMAPPED_WIRE_ITEM_FIELDS = [
  'attachments',
  'delivery',
  'textAppend',
] as const

/**
 * Wire `session.patch` fields with no local counterpart. The local session row
 * has neither: a remote pull request URL is read from the daemon's session
 * snapshot instead (`parseRemoteSessionWorkspaceInfo`), and Rooms are not a
 * Convergence concept yet.
 */
export const EXECUTION_HOST_UNMAPPED_WIRE_SESSION_PATCH_FIELDS = [
  'prUrl',
  'roomId',
] as const

/**
 * Local session fields a wire `session.patch` is allowed to carry. Anything
 * outside this list is dropped — see
 * EXECUTION_HOST_UNMAPPED_WIRE_SESSION_PATCH_FIELDS.
 */
const LOCAL_SESSION_PATCH_FIELDS = [
  'status',
  'attention',
  'activity',
  'contextWindow',
  'continuationToken',
  'updatedAt',
] as const

/** Local conversation-item fields a wire item patch is allowed to carry. */
const LOCAL_CONVERSATION_ITEM_PATCH_FIELDS = [
  'state',
  'createdAt',
  'updatedAt',
  'providerMeta',
  'actor',
  'text',
  'toolName',
  'inputText',
  'relatedItemId',
  'outputText',
  'description',
  'prompt',
  'level',
] as const

export interface LocalSendMessageOptions {
  deliveryMode: MidRunInputMode
  queuedInputId?: string | null
  expectedProviderTurnId?: string | null
  interactionResponse?: InteractionResponse
}

/**
 * Builds the wire start request for a local session start. The local
 * `workspace` lives inside the config but is a sibling of it on the wire, so
 * it moves up here; everything on
 * EXECUTION_HOST_UNMAPPED_START_CONFIG_FIELDS is left behind.
 */
export function buildWireStartRequest(
  providerId: string,
  config: SessionStartConfig,
): ExecutionStartRequest {
  const wireConfig: ExecutionStartConfig = {
    sessionId: config.sessionId,
    workingDirectory: config.workingDirectory,
    initialMessage: config.initialMessage,
    model: config.model,
    effort: config.effort,
    continuationToken: config.continuationToken,
    ...(config.permissionConfig
      ? { permissionConfig: config.permissionConfig }
      : {}),
  }

  return {
    protocolVersion: EXECUTION_PROTOCOL_VERSION,
    providerId,
    config: wireConfig,
    ...(config.workspace ? { workspace: config.workspace } : {}),
  }
}

/**
 * Builds the wire send-message command. Attachments and skill selections are
 * opaque arrays on the wire, so the local shapes travel unchanged.
 */
export function buildWireSendMessageCommand(
  text: string,
  attachments?: Attachment[],
  skillSelections?: SkillSelection[],
  options?: LocalSendMessageOptions,
): ExecutionHostCommand {
  return {
    kind: 'send-message',
    text,
    ...(attachments ? { attachments } : {}),
    ...(skillSelections ? { skillSelections } : {}),
    ...(options ? { options } : {}),
  }
}

/** Builds the wire approve command. */
export function buildWireApproveCommand(
  providerApprovalId?: string,
): ExecutionHostCommand {
  return { kind: 'approve', providerApprovalId }
}

/** Builds the wire deny command. */
export function buildWireDenyCommand(
  providerApprovalId?: string,
): ExecutionHostCommand {
  return { kind: 'deny', providerApprovalId }
}

/** Builds the wire stop command. */
export function buildWireStopCommand(): ExecutionHostCommand {
  return { kind: 'stop' }
}

/**
 * Translates a decoded wire delta into the local one, or null when the wire
 * kind has no local home (see EXECUTION_HOST_UNMAPPED_WIRE_DELTA_KINDS).
 */
export function toLocalSessionDelta(
  delta: ExecutionSessionDelta,
): SessionDelta | null {
  switch (delta.kind) {
    case 'session.patch':
      return {
        kind: 'session.patch',
        patch: pickDefined(delta.patch, LOCAL_SESSION_PATCH_FIELDS),
      }
    case 'conversation.item.add':
      return {
        kind: 'conversation.item.add',
        item: toLocalConversationItemDraft(delta.item),
      }
    case 'conversation.item.patch':
      return {
        kind: 'conversation.item.patch',
        itemId: delta.itemId,
        patch: toLocalConversationItemPatch(delta.patch),
      }
    case 'turn.add':
      return {
        kind: 'turn.add',
        turn: {
          id: delta.turn.id,
          sessionId: delta.turn.sessionId,
          sequence: delta.turn.sequence,
          startedAt: delta.turn.startedAt,
          endedAt: delta.turn.endedAt,
          status: delta.turn.status,
          summary: delta.turn.summary,
          // The daemon runs its own accounts and does not report which model
          // served a turn, so a remote turn is unattributed by construction.
          providerAccountId: null,
          model: null,
          effort: null,
        },
      }
    case 'turn.fileChanges.add':
      return {
        kind: 'turn.fileChanges.add',
        turnId: delta.turnId,
        fileChanges: delta.fileChanges.map((change) => ({
          id: change.id,
          sessionId: change.sessionId,
          turnId: change.turnId,
          filePath: change.filePath,
          oldPath: change.oldPath,
          status: change.status,
          additions: change.additions,
          deletions: change.deletions,
          diff: change.diff,
          createdAt: change.createdAt,
        })),
      }
    case 'turn.patch':
      return null
  }
}

/**
 * Translates a wire conversation item into the local draft. `turnId` is null
 * because the wire carries no turn attribution; the session service assigns
 * the real one when it persists the item.
 */
function toLocalConversationItemDraft(
  item: ExecutionConversationItem,
): ConversationItemDraft {
  const base = {
    id: item.id,
    turnId: null,
    state: item.state,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    providerMeta: item.providerMeta,
  }

  switch (item.kind) {
    case 'message':
      return { ...base, kind: 'message', actor: item.actor, text: item.text }
    case 'thinking':
      return { ...base, kind: 'thinking', actor: 'assistant', text: item.text }
    case 'tool-call':
      return {
        ...base,
        kind: 'tool-call',
        toolName: item.toolName,
        inputText: item.inputText,
      }
    case 'tool-result':
      return {
        ...base,
        kind: 'tool-result',
        toolName: item.toolName,
        relatedItemId: item.relatedItemId,
        outputText: item.outputText,
      }
    case 'approval-request':
      return {
        ...base,
        kind: 'approval-request',
        description: item.description,
      }
    case 'input-request':
      return {
        ...base,
        kind: 'input-request',
        prompt: item.prompt,
        ...(item.request ? { request: item.request } : {}),
      }
    case 'note':
      return { ...base, kind: 'note', level: item.level, text: item.text }
  }
}

/**
 * Narrows a wire item patch to the fields the local item models. Wire-only
 * fields are dropped rather than stored where nothing would read them.
 */
function toLocalConversationItemPatch(
  patch: ExecutionConversationItemPatch,
): Partial<ConversationItem> {
  return pickDefined(
    patch,
    LOCAL_CONVERSATION_ITEM_PATCH_FIELDS,
  ) as Partial<ConversationItem>
}

/**
 * Copies the named fields that are present, so a wire payload becomes a local
 * one by allowlist. Every field the wire adds in a later version is dropped
 * until it is named here, which is the additive-only guarantee in code.
 */
function pickDefined<T>(source: object, fields: readonly string[]): T {
  const record = source as Record<string, unknown>
  const picked: Record<string, unknown> = {}
  for (const field of fields) {
    if (record[field] !== undefined) picked[field] = record[field]
  }
  return picked as T
}
