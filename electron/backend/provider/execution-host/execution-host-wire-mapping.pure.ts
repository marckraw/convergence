import {
  EXECUTION_PROTOCOL_VERSION,
  type ExecutionConversationItem,
  type ExecutionConversationItemPatch,
  type ExecutionHostCommand,
  type ExecutionSendMessageOptions,
  type ExecutionSessionDelta,
  type ExecutionStartConfig,
  type ExecutionStartRequest,
  type ExecutionTurnFileChange,
} from '@mrck-labs/execution-host-protocol'
import type {
  ConversationItem,
  ConversationItemDraft,
  SessionDelta,
} from '../../session/conversation-item.types'
import type { SkillSelection } from '../../skills/skills.types'
import type {
  Attachment,
  AttentionState,
  SessionHandle,
  SessionStartConfig,
  SessionStatus,
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
 * Local start-config fields the wire must not carry *when the request also
 * names a workspace*, because the daemon reads them as a competing instruction.
 *
 * `workingDirectory` on the wire means "run in this directory that already
 * exists on the host" — since `projects.v1` the daemon resolves it as a
 * Project. `workspace` means "clone this repository into a fresh per-session
 * worktree". A start request carrying both asks the daemon for two different
 * roots, and daemon 0.26.1 rejects the pair outright with HTTP 400: *"A session
 * cannot use both a Project working directory and a target repository."*
 *
 * Convergence sent both, so every remote session start failed. The local value
 * was never usable there anyway: it is a path on this machine, which is exactly
 * why the start carries a workspace for the daemon to clone instead
 * (`SessionStartConfig.workspace`, `requireRemoteWorkspace`).
 *
 * The omission is conditional on purpose. A daemon-side Project start — a
 * working directory with no workspace — is a real shape the wire must keep
 * expressing, and RE3 will produce it from a Project picker gated on
 * `projects.v1`. Dropping `workingDirectory` unconditionally would weld that
 * future shut.
 */
export const EXECUTION_HOST_WORKSPACE_EXCLUSIVE_START_CONFIG_FIELDS = [
  'workingDirectory',
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
 * Local delta kinds that never travel to a host, so the outbound mapping
 * returns null for them.
 *
 * Turn records are Convergence's own bookkeeping, written by the turn-capture
 * service against local runs. A host mints its own turns and would have no use
 * for ours, and the local shapes carry fields (`providerAccountId`, `model`,
 * `effort`, a `renamed` file status) the wire does not model at all.
 */
export const EXECUTION_HOST_UNSENT_LOCAL_DELTA_KINDS = [
  'turn.add',
  'turn.fileChanges.add',
] as const satisfies readonly SessionDelta['kind'][]

/**
 * Local conversation-item fields that do not survive the trip to the wire.
 * `turnId` is re-derived by whoever persists the item; the rest are
 * Convergence-local concepts (see EXECUTION_HOST_UNMAPPED_WIRE_ITEM_FIELDS for
 * the mirror image).
 */
export const EXECUTION_HOST_UNSENT_LOCAL_ITEM_FIELDS = [
  'turnId',
  'attachmentIds',
  'skillSelections',
  'deliveryMode',
  'action',
] as const

/**
 * Wire `ExecutionTurnFileChange` fields the local `TurnFileChange` has nowhere
 * to put.
 *
 * Empty since MAR-2577, and kept rather than deleted: this is the one place a
 * reader looks to ask "what does a remote file change lose on the way in", and
 * an empty list is a stronger answer than no list. The three that were here —
 * `repoRoot`, `truncated`, `binary` — are the ones that change what a diff
 * *means*, which is why they were the loss worth repairing first: a cut diff
 * rendered as the whole change, and a binary marker rendered as the content.
 * The local record now carries all three.
 *
 * "Nothing is dropped" is a statement about this mapping only. `repoRoot`
 * arrives and is stored, but storage still keys a change by `(turn_id,
 * file_path)`, so two repositories with the same path in one workspace collide
 * on insert rather than merging: `UNIQUE constraint failed` rolls back the
 * transaction that also stamps the turn's `ended_at`, costing that turn its
 * file changes and leaving it `running` — MAR-2589, and not a loss this list
 * can express.
 */
export const EXECUTION_HOST_UNMAPPED_WIRE_FILE_CHANGE_FIELDS =
  [] as const satisfies readonly (keyof ExecutionTurnFileChange)[]

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

/** The patch a local `session.patch` delta carries. */
type LocalSessionPatch = Extract<
  SessionDelta,
  { kind: 'session.patch' }
>['patch']

/**
 * The attention a terminal status means, or null for a status that settles
 * nothing.
 *
 * A settle and the attention it carries are one fact: `completed` means
 * `finished`, `failed` means `failed`. The local path has always written them
 * together (`claude-code-provider.ts:1071-1072`), and so does the service when
 * it settles an approval nobody is left to answer
 * (`session.service.ts:1362-1368`). A host splits them — the daemon sends the
 * status and the attention as two wire events, and the second arrives after
 * the settle has released the handle, so it is dropped as a released handle's
 * claims about a run must be (MAR-2590).
 *
 * It is derived here, once, because a settle reaches the record through two
 * supported encodings — a dedicated `status` event and a `session.patch`
 * carrying a status — and `SessionService.applyDelta` ends the turn on either.
 * A pairing applied to only one of them would leave the other reporting
 * finished work with nothing to show for it, which is the defect this replaces
 * rather than a shape it may keep.
 *
 * The switch is exhaustive on purpose: a new `SessionStatus` is a compile
 * error here rather than a silently unpaired settle.
 */
export function settledAttentionForStatus(
  status: SessionStatus,
): AttentionState | null {
  switch (status) {
    case 'completed':
      return 'finished'
    case 'failed':
      return 'failed'
    case 'idle':
    case 'running':
      return null
  }
}

/**
 * A session patch with the attention its terminal status means, when it does
 * not already say one.
 *
 * An explicit attention always wins, and the patch is returned untouched:
 * the wire models `status` and `attention` on the same patch precisely so a
 * host can state both, and a host is the authority on what its own run needs.
 * Only silence is filled. A patch this has nothing to add to is returned by
 * identity, so a non-terminal patch travels byte-identical.
 */
export function withSettledAttention(
  patch: LocalSessionPatch,
): LocalSessionPatch {
  if (patch.attention !== undefined || !patch.status) return patch
  const attention = settledAttentionForStatus(patch.status)
  return attention ? { ...patch, attention } : patch
}

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

/**
 * Exactly what `SessionHandle.sendMessage` hands the adapter — derived from the
 * handle rather than restated, so this mapping can never again believe in a
 * narrower object than the one it actually receives at runtime.
 */
export type LocalSendMessageOptions = NonNullable<
  Parameters<SessionHandle['sendMessage']>[3]
>

/**
 * Local send-message option fields with no home on the wire
 * `ExecutionSendMessageOptions`.
 *
 * - `providerAccountId` — Convergence's own multi-account concept (ADR 0007).
 *   It names a credential namespace on this machine; a remote run authenticates
 *   as the daemon's own account, so the id would have no reader on the far side
 *   and no business travelling there. Local-only by nature (constitution
 *   Law 4).
 */
export const EXECUTION_HOST_UNSENT_LOCAL_SEND_OPTION_FIELDS = [
  'providerAccountId',
] as const satisfies readonly (keyof LocalSendMessageOptions)[]

/**
 * Builds the wire start request for a local session start. The local
 * `workspace` lives inside the config but is a sibling of it on the wire, so
 * it moves up here; everything on
 * EXECUTION_HOST_UNMAPPED_START_CONFIG_FIELDS is left behind, and a request
 * that carries a workspace also leaves
 * EXECUTION_HOST_WORKSPACE_EXCLUSIVE_START_CONFIG_FIELDS behind.
 */
export function buildWireStartRequest(
  providerId: string,
  config: SessionStartConfig,
): ExecutionStartRequest {
  const wireConfig: ExecutionStartConfig = {
    sessionId: config.sessionId,
    ...(config.workspace ? {} : { workingDirectory: config.workingDirectory }),
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
    ...(options ? { options: toWireSendMessageOptions(options) } : {}),
  }
}

/**
 * Names every option field the wire is allowed to carry and copies those,
 * rather than spreading the caller's object. The spread is what let
 * `providerAccountId` reach the daemon while the local type claimed it could
 * not — a field the wire has no slot for still travels if the runtime object
 * holds it. Construction by allowlist makes the loss provable instead of
 * accidental; see EXECUTION_HOST_UNSENT_LOCAL_SEND_OPTION_FIELDS.
 */
function toWireSendMessageOptions(
  options: LocalSendMessageOptions,
): ExecutionSendMessageOptions {
  return {
    deliveryMode: options.deliveryMode,
    ...(options.queuedInputId !== undefined
      ? { queuedInputId: options.queuedInputId }
      : {}),
    ...(options.expectedProviderTurnId !== undefined
      ? { expectedProviderTurnId: options.expectedProviderTurnId }
      : {}),
    ...(options.interactionResponse !== undefined
      ? { interactionResponse: options.interactionResponse }
      : {}),
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
          // Absent on the wire means the working-directory root repository,
          // which the local record spells null (MAR-2577).
          repoRoot: change.repoRoot ?? null,
          filePath: change.filePath,
          oldPath: change.oldPath,
          status: change.status,
          additions: change.additions,
          deletions: change.deletions,
          diff: change.diff,
          truncated: change.truncated,
          binary: change.binary,
          createdAt: change.createdAt,
        })),
      }
    case 'turn.patch':
      return null
  }
}

/**
 * Translates a local delta into the wire one, or null when the local kind is
 * never sent to a host (see EXECUTION_HOST_UNSENT_LOCAL_DELTA_KINDS).
 *
 * The outbound half of the anti-corruption layer. Convergence does not push
 * deltas today — it only consumes them — but keeping the translation
 * symmetric is what makes the mapping provable: a delta that survives
 * local -> wire -> local unchanged is one the layer demonstrably does not
 * corrupt.
 */
export function toWireSessionDelta(
  delta: SessionDelta,
): ExecutionSessionDelta | null {
  switch (delta.kind) {
    case 'session.patch':
      return {
        kind: 'session.patch',
        patch: pickDefined(delta.patch, LOCAL_SESSION_PATCH_FIELDS),
      }
    case 'conversation.item.add':
      return {
        kind: 'conversation.item.add',
        item: pickDefined<ExecutionConversationItem>(delta.item, [
          'id',
          'kind',
          ...LOCAL_CONVERSATION_ITEM_PATCH_FIELDS,
          'request',
        ]),
      }
    case 'conversation.item.patch':
      return {
        kind: 'conversation.item.patch',
        itemId: delta.itemId,
        patch: pickDefined(delta.patch, LOCAL_CONVERSATION_ITEM_PATCH_FIELDS),
      }
    case 'turn.add':
    case 'turn.fileChanges.add':
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
