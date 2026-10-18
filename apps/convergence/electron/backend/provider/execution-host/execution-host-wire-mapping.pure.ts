import {
  EXECUTION_PROTOCOL_VERSION,
  EXECUTION_TOOL_ATTACHMENT_OMISSION_CODES,
  type ExecutionConversationItem,
  type ExecutionConversationItemPatch,
  type ExecutionHostCommand,
  type ExecutionInteractionResponse,
  type ExecutionSendMessageOptions,
  type ExecutionSessionDelta,
  type ExecutionStartConfig,
  type ExecutionStartRequest,
  type ExecutionToolAttachment,
  type ExecutionToolAttachmentOmissionCode,
  type ExecutionToolAttachmentOmissions,
  type ExecutionTurnFileChange,
  type ExecutionTurnOrigin,
  type ExecutionWorkspaceSource,
  type HarnessEvidence as WireHarnessEvidence,
  type SessionAgentRun as WireSessionAgentRun,
  type SessionTask as WireSessionTask,
  type ExecutionClaudePermissionMode,
  type ExecutionCodexApprovalPolicy,
  type ExecutionCodexSandboxMode,
  type ExecutionInteractionRequestKind,
  type ExecutionPermissionPreset,
  type ExecutionProvider,
  type ExecutionProviderModel,
  type ExecutionProviderPermissions,
  type ExecutionProviderUsage,
  type ExecutionProviderUsageCredits,
  type ExecutionProviderUsageWindow,
  type KnownExecutionProtocolCapability,
} from '@mrck-labs/execution-host-protocol'
import type { ExecutionSessionSnapshot } from '@mrck-labs/execution-host-protocol/client'
import type {
  ConversationItem,
  ConversationItemDraft,
  SessionDelta,
  ToolAttachmentOmissionCode,
  ToolAttachmentOmissions,
} from '../../session/conversation-item.types'
import { readToolAttachmentOmissions } from '../../session/conversation-item.pure'
import type {
  HarnessEvidence,
  SessionAgentRun,
  SessionTask,
} from '../../session/harness-evidence.types'
import type { SkillSelection } from '../../skills/skills.types'
import type {
  Attachment,
  AttentionState,
  ClaudeCodePermissionMode,
  CodexApprovalPolicy,
  CodexSandboxMode,
  ProviderInteractionRequestKind,
  SessionHandle,
  SessionPermissionPreset,
  SessionStartConfig,
  SessionStatus,
} from '../provider.types'
import type {
  ProviderHostPermissions,
  ProviderHostUsage,
  ProviderHostUsageCredits,
  ProviderHostUsageWindow,
} from '../provider-catalog.types'

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

/** Every key any member of a union has. */
type KeysOfUnion<T> = T extends unknown ? keyof T : never

/** Every field a wire conversation item, of any kind, or an item patch carries. */
export type WireConversationItemField =
  | KeysOfUnion<ExecutionConversationItem>
  | KeysOfUnion<ExecutionConversationItemPatch>

/** Every field a wire `session.patch` carries. */
export type WireSessionPatchField = keyof Extract<
  ExecutionSessionDelta,
  { kind: 'session.patch' }
>['patch']

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
 * - `noTurnSinceBoundary` — a fact read off *this* transcript for *this*
 *   process's adapter (MAR-2854). A remote run's provider is the daemon's own,
 *   with its own conversation bookkeeping, so the answer would be about the
 *   wrong ledger even if the wire carried it.
 */
export const EXECUTION_HOST_UNMAPPED_START_CONFIG_FIELDS = [
  'initialAttachments',
  'initialSkillSelections',
  'previousAssistantTexts',
  'serviceTier',
  'providerAccountId',
  'noTurnSinceBoundary',
  'readParallelWorkCounts',
  'readTaskStatus',
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
 * Start-request fields Convergence never builds, pinned by name (MAR-2689).
 *
 * `automation` carries the daemon's `autoCreatePr`, which runs `git add -A`
 * with a generated message whenever the tree is dirty — the opposite of every
 * commit law this project works under, and a thing no session here has ever
 * asked for. It has always been absent, and that is the trouble: a silent
 * absence is this codebase's most repeated defect class, and an absence nothing
 * asserts is one field-spread away from becoming a present.
 *
 * So it gets a canary rather than code. `buildWireStartRequest` names every key
 * it emits, so adding `automation: { autoCreatePr: true }` there is what turns
 * the assertion red — which is precisely the change that would need a ruling
 * and not a commit.
 *
 * `environment` joins it at protocol 0.14 (MAR-2694). The daemon can prepare a
 * session with a named Environment's variables, and Convergence names none:
 * which environment a Project or an errand should get is MAR-2688's question
 * and is not this slice's to answer. Sending `null` would not be neutral
 * either — on a residency that is "the Project's default", on an errand "the
 * base set alone" — so the field stays off the wire entirely and the daemon
 * keeps deciding, which is what it does for a client that predates the field.
 *
 * Protocol 0.15 and 0.20 add three more, pinned for the same reason
 * (MAR-3987). `requires` (0.20/0.21) asks a host to check traits before it
 * starts; a client that sends it must first read `/health` for
 * `start.requires.v1` and check the echo, which Convergence does not do.
 * `actor` and `commandId` (0.15) say who started a session and match the start
 * to its echo; Convergence matches its sends by its own record.
 */
export const EXECUTION_HOST_NEVER_SENT_START_REQUEST_FIELDS = [
  'automation',
  'environment',
  'requires',
  'actor',
  'commandId',
] as const satisfies readonly (keyof ExecutionStartRequest)[]

/**
 * Wire delta kinds Convergence receives but has no local delta for, so the
 * mapping returns null and the session never sees them.
 *
 * `turn.patch` closes a turn record the local session model does not keep for
 * remote runs — local turns are written by the turn-capture service, never
 * from the wire. Dropping it matches what the session service already did with
 * it: `applyDelta` has no branch for the kind.
 *
 * `evidence` (protocol 0.19) left this list with MAR-3684: it is the local
 * `harness.evidence` delta, applied through `HarnessEvidenceService` as a
 * local run's is.
 */
export const EXECUTION_HOST_UNMAPPED_WIRE_DELTA_KINDS = [
  'turn.patch',
] as const satisfies readonly ExecutionSessionDelta['kind'][]

/**
 * Wire `evidence` delta fields the local `harness.evidence` delta does not
 * carry (MAR-3684).
 *
 * `turnId` names the host's turn, and Convergence keeps no record of a remote
 * run's turns from the wire (see `turn.patch` above): its turns are the ones
 * the session service mints when the user message lands. So remote evidence is
 * attributed as local evidence is, to the session's active turn, which is the
 * turn the local `session_turns` row exists for. Taking the host's id instead
 * would write `turn.accounting` against a turn no row has.
 */
export const EXECUTION_HOST_UNMAPPED_WIRE_EVIDENCE_FIELDS = [
  'turnId',
] as const satisfies readonly (keyof Extract<
  ExecutionSessionDelta,
  { kind: 'evidence' }
>)[]

/**
 * Wire fields dropped when a wire conversation item or item patch becomes a
 * local one.
 *
 * - `delivery` — the daemon's queued/delivered/undelivered lifecycle for a
 *   user message. The local `deliveryMode` is a different concept (how the
 *   composer sent the text), so this has no local reader.
 * - `textAppend` — incremental text, sent only to a subscriber that negotiates
 *   `?deltas=append`. Convergence does not, so the daemon strips it before the
 *   envelope is written and full `text` always arrives instead.
 * - `author`, `clientMessageId` — who wrote a user message and which send
 *   made it (protocol 0.15). Convergence matches its sends by its own record,
 *   and a remote session has one writer here.
 *
 * `agentRunId` and `taskId` (protocol 0.19) left this list with MAR-3684: they
 * are the local item's own columns, which the remote evidence now fills in.
 * `attachments` and `attachmentOmissions` (protocol 0.23) left it with
 * MAR-4274: see EXECUTION_HOST_FETCHED_WIRE_ITEM_FIELDS and
 * ConversationItemAddOnlyField.
 */
export const EXECUTION_HOST_UNMAPPED_WIRE_ITEM_FIELDS = [
  'delivery',
  'textAppend',
  'author',
  'clientMessageId',
] as const satisfies readonly WireConversationItemField[]

/**
 * Wire item fields that are mapped by fetching, not by copying (MAR-4274).
 *
 * `attachments` on a tool result (`items.toolAttachments.v1`) are references
 * to images the host kept: an id, a name, a type and a size, never the bytes.
 * A daemon-side id means nothing to Convergence's attachment store, so the
 * remote run downloads each one (`downloadAttachment`, kind `tool`) and hands
 * the bytes to the session as a `conversation.item.toolImages` delta, which
 * stores them and gives the item the store's own ids
 * (`wireToolImageReferences`, `RemoteToolImageFetcher`).
 *
 * The same field on a message names what its sender attached. Convergence
 * sends none to a host (MAR-1415), so a message with attachments came from
 * another client of the same session; those are not fetched yet, and the
 * message shows its text alone (MAR-4314).
 */
export const EXECUTION_HOST_FETCHED_WIRE_ITEM_FIELDS = [
  'attachments',
] as const satisfies readonly WireConversationItemField[]

/**
 * Wire item fields copied when an item is added and never patched: the
 * protocol fixes them at the add (protocol 0.23), and a patch that carries one
 * is ignored, so they are read in `toLocalConversationItemDraft` and nowhere
 * else (MAR-4274).
 *
 * `attachmentOmissions` counts the images a host left out of a tool result,
 * by fixed code. The local item keeps the same counts, under the same names.
 */
type ConversationItemAddOnlyField = 'attachmentOmissions'

/**
 * Which agent run or task produced an item (protocol 0.19). Both ways they
 * are optional strings on the wire and nullable on the local item, so a local
 * null travels as an absent key: the wire refuses a null, and absent already
 * means "the main agent", or "no task".
 */
const CONVERSATION_ITEM_ATTRIBUTION_FIELDS = ['agentRunId', 'taskId'] as const

/**
 * Local delta kinds that never travel to a host, so the outbound mapping
 * returns null for them.
 *
 * Turn records are Convergence's own bookkeeping, written by the turn-capture
 * service against local runs. A host mints its own turns and would have no use
 * for ours, and the local shapes carry fields (`providerAccountId`, `model`,
 * `effort`, a `renamed` file status) the wire does not model at all.
 *
 * `harness.evidence` left this list with MAR-3684: the wire's `evidence`
 * delta carries it unchanged.
 *
 * `conversation.item.toolImages` carries image bytes on their way into this
 * app's attachment store (MAR-4274). A host keeps its own images and names
 * them by reference on the item it adds; bytes never travel in a delta.
 */
export const EXECUTION_HOST_UNSENT_LOCAL_DELTA_KINDS = [
  'turn.add',
  'turn.fileChanges.add',
  'conversation.item.toolImages',
] as const satisfies readonly SessionDelta['kind'][]

/**
 * Local conversation-item fields that do not survive the trip to the wire.
 * `turnId` is re-derived by whoever persists the item, and `agentAttribution`
 * is the label the read joins in from the agent run `agentRunId` names; the
 * rest are Convergence-local concepts (see
 * EXECUTION_HOST_UNMAPPED_WIRE_ITEM_FIELDS for the mirror image).
 */
export const EXECUTION_HOST_UNSENT_LOCAL_ITEM_FIELDS = [
  'turnId',
  'agentAttribution',
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
 * "Nothing is dropped" was once a statement about this mapping only: `repoRoot`
 * arrived and was stored, but storage keyed a change by `(turn_id, file_path)`,
 * so two repositories with the same path in one workspace collided on insert
 * rather than merging — `UNIQUE constraint failed` rolled back the transaction
 * that also stamps the turn's `ended_at`, costing that turn its file changes
 * and leaving it `running`. MAR-2589 closed it by making the repository part of
 * a change's identity: a unique expression index over `(turn_id,
 * COALESCE(repo_root, ''), file_path)` in `database.ts`, and a repo-aware
 * `getFileDiff` down to the changed-files tree. What arrives here now survives
 * all the way to a row and back out to a diff.
 */
export const EXECUTION_HOST_UNMAPPED_WIRE_FILE_CHANGE_FIELDS =
  [] as const satisfies readonly (keyof ExecutionTurnFileChange)[]

/**
 * Rooms have no local counterpart. PR URLs travel only as refresh hints, and
 * `runningTasks` as the count a remote session's answer still waits on.
 *
 * `model` and `effort` (protocol 0.17) are the selection a host's next turn
 * runs on. Convergence sends none (`sessions.modelSelection.v1`), so a remote
 * session's selection is the one it started with.
 *
 * `permissionConfig` (protocol 0.27) is the session's whole permission policy
 * after a change to a running session (`sessions.permissionModes.v1`), which
 * only a session PATCH makes. Convergence sends none: a remote session's
 * policy is the one its start carried, and the record keeps that. A change
 * another client makes to the same session is not shown here (MAR-4273).
 */
export const EXECUTION_HOST_UNMAPPED_WIRE_SESSION_PATCH_FIELDS = [
  'roomId',
  'model',
  'effort',
  'permissionConfig',
] as const satisfies readonly WireSessionPatchField[]

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
  'prUrl',
  'runningTasks',
] as const satisfies readonly WireSessionPatchField[]

/** The patch a local `session.patch` delta carries. */
export type LocalSessionPatch = Extract<
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
    case 'answered':
      return null
  }
}

/**
 * A session patch with the attention its terminal status means, when it does
 * not already say one. `openRequest` is the attention of a request the host
 * raised and has not resolved, which a `completed` keeps.
 *
 * An explicit attention always wins, and the patch is returned untouched:
 * the wire models `status` and `attention` on the same patch precisely so a
 * host can state both, and a host is the authority on what its own run needs.
 * Only silence is filled. A patch this has nothing to add to is returned by
 * identity, so a non-terminal patch travels byte-identical.
 */
export function withSettledAttention(
  patch: LocalSessionPatch,
  openRequest: AttentionState | null = null,
): LocalSessionPatch {
  if (patch.attention !== undefined || !patch.status) return patch
  // A request still open outlasts the answer that raised it: a plan waiting
  // for review is still waiting once the turn is over. The local Claude
  // provider keeps it (`finishAnswer`: `permissions.pendingAttention ??
  // 'finished'`), and agents-daemon #187 settles such a session `completed`
  // with no attention for exactly that reason. Filling `finished` there
  // cleared the request a person still owed an answer (MAR-3987).
  if (
    patch.status === 'completed' &&
    (openRequest === 'needs-input' || openRequest === 'needs-approval')
  )
    return { ...patch, attention: openRequest }
  const attention = settledAttentionForStatus(patch.status)
  return attention ? { ...patch, attention } : patch
}

/**
 * A `running` patch with who opened the turn it starts (MAR-3987).
 *
 * The wire says it on the turn (`origin`, protocol 0.19), and the local record
 * reads it on the status: a `running` patch saying `turnOpenedBy: 'user'`
 * opens a new answer window, and one from a harness turn keeps the window of
 * the answer it reports back on. That is what the local Claude provider sends
 * (`claude-code-provider.ts`, `setStatus`), so a remote session reads the
 * same. The host adds the turn before it reports it running, so the origin is
 * the last `turn.add`'s. A patch that already says, a status that is not
 * `running`, or no turn to go by, travels unchanged.
 */
export function withTurnOpenedBy(
  patch: LocalSessionPatch,
  origin: ExecutionTurnOrigin | null,
): LocalSessionPatch {
  if (patch.status !== 'running' || !origin || patch.turnOpenedBy) return patch
  return { ...patch, turnOpenedBy: origin }
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
  'onTurnAccepted',
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
    ...(config.workspace
      ? { workspace: buildWireWorkspaceSource(config.workspace) }
      : {}),
  }
}

/**
 * The workspace source, built field by field (MAR-2694).
 *
 * By allowlist for the reason the config above it is: a runtime object can
 * carry more than its type admits, and the start request is not the place to
 * find that out. It used to travel by reference, which was harmless only while
 * the local shape and the wire shape happened to be the same three fields.
 *
 * An absent optional is an absent *key*, never a null. `ref` and `branchName`
 * are both "the daemon decides" when omitted, and the daemon decides by not
 * being told -- a `branchName: null` on the wire asks it to materialise a
 * branch with no name instead of asking it for one of its own choosing.
 */
function buildWireWorkspaceSource(
  workspace: NonNullable<SessionStartConfig['workspace']>,
): ExecutionWorkspaceSource {
  return {
    repository: workspace.repository,
    ...(workspace.ref == null ? {} : { ref: workspace.ref }),
    ...(workspace.branchName == null
      ? {}
      : { branchName: workspace.branchName }),
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
      ? {
          interactionResponse: toWireInteractionResponse(
            options.interactionResponse,
          ),
        }
      : {}),
  }
}

/**
 * Local interaction-response fields with no home on the wire
 * `ExecutionInteractionResponse`.
 *
 * - `providerItemId` — the local provider's id for the request being
 *   answered, which a local adapter uses to find its pending prompt. A host
 *   answers the request it has open, and its decoder rebuilds the response
 *   field by field without this one, so it was sent and thrown away; built by
 *   allowlist below, it is no longer sent at all.
 */
export const EXECUTION_HOST_UNSENT_LOCAL_INTERACTION_RESPONSE_FIELDS = [
  'providerItemId',
] as const satisfies readonly KeysOfUnion<
  NonNullable<LocalSendMessageOptions['interactionResponse']>
>[]

/**
 * A structured answer, choice, plan, form or url, built field by field for
 * the reason the options around it are: a plan answer (`approve` or `reject`,
 * and its message) is what a host acts on, and nothing else of the local
 * shape should ride along with it.
 */
function toWireInteractionResponse(
  response: NonNullable<LocalSendMessageOptions['interactionResponse']>,
): ExecutionInteractionResponse {
  switch (response.kind) {
    case 'choice':
      return {
        kind: 'choice',
        answers: response.answers.map((answer) => ({
          questionId: answer.questionId,
          values: answer.values,
        })),
      }
    case 'plan':
      return {
        kind: 'plan',
        decision: response.decision,
        ...(response.message !== undefined
          ? { message: response.message }
          : {}),
      }
    case 'form':
      return { kind: 'form', action: response.action, values: response.values }
    case 'url':
      return { kind: 'url', action: response.action }
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
 * The capability a host advertises when it takes `stop-task` (protocol 0.19):
 * it stops one task its agent started, a background command or a subagent,
 * without interrupting the session.
 */
export const EXECUTION_HOST_STOP_TASK_CAPABILITY =
  'commands.stopTask.v1' satisfies KnownExecutionProtocolCapability

/**
 * Builds the wire stop-task command (protocol 0.19). The id is the one the
 * session's evidence named, a task's `taskId` or an agent run's linked task,
 * which is what the parallel-work panel's Stop hands the handle.
 */
export function buildWireStopTaskCommand(taskId: string): ExecutionHostCommand {
  return { kind: 'stop-task', taskId }
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
    case 'evidence':
      // The wire's evidence is Convergence's own `HarnessEvidence`, copied into
      // the protocol under the same names (protocol 0.19), so it is handed over
      // whole: every harness family a local run records, a remote one now
      // records too. This assignment and its mirror in `toWireSessionDelta`
      // only prove the two copies assignable each way, which a new optional
      // field on either side survives; the exact pin is `evidenceShape` in
      // EXECUTION_HOST_WIRE_INVENTORY_IS_EXHAUSTIVE.
      return { kind: 'harness.evidence', evidence: delta.evidence }
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
 * corrupt. `answered` travels as itself: the wire has had it since protocol
 * 0.19, so the `running` it was sent as on the four-state wire is gone.
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
        item: {
          ...pickDefined<ExecutionConversationItem>(delta.item, [
            'id',
            'kind',
            ...LOCAL_CONVERSATION_ITEM_PATCH_FIELDS,
            'request',
          ]),
          ...wireAttribution(delta.item),
          ...(delta.item.kind === 'tool-result'
            ? wireToolAttachmentOmissions(delta.item.attachmentOmissions)
            : {}),
        } as ExecutionConversationItem,
      }
    case 'conversation.item.patch':
      return {
        kind: 'conversation.item.patch',
        itemId: delta.itemId,
        patch: {
          ...pickDefined<ExecutionConversationItemPatch>(
            delta.patch,
            LOCAL_CONVERSATION_ITEM_PATCH_FIELDS,
          ),
          ...wireAttribution(delta.patch),
        },
      }
    case 'harness.evidence':
      // The local delta names no turn: the record attributes it to the active
      // one on the way in (EXECUTION_HOST_UNMAPPED_WIRE_EVIDENCE_FIELDS), so
      // the wire's "belongs to no turn" is the only honest thing to send.
      return { kind: 'evidence', turnId: null, evidence: delta.evidence }
    case 'turn.add':
    case 'turn.fileChanges.add':
    case 'conversation.item.toolImages':
      return null
  }
}

/**
 * A local tool result's omission counts as the wire spells them: the codes
 * the protocol has. `download-failed` is this app's account of its own fetch,
 * which no host has a word for, so it stays here.
 */
function wireToolAttachmentOmissions(
  omissions: ToolAttachmentOmissions | undefined,
): { attachmentOmissions?: ExecutionToolAttachmentOmissions } {
  const wire: ExecutionToolAttachmentOmissions = {}
  let any = false
  for (const code of EXECUTION_TOOL_ATTACHMENT_OMISSION_CODES) {
    const count = omissions?.[code]
    if (count) {
      wire[code] = count
      any = true
    }
  }
  return any ? { attachmentOmissions: wire } : {}
}

/**
 * The images a host kept for a tool result it has just added, by reference
 * (`items.toolAttachments.v1`), with the item they belong to, or null when
 * the delta adds no tool result with images. What a remote run downloads; see
 * EXECUTION_HOST_FETCHED_WIRE_ITEM_FIELDS.
 *
 * Only an add: the protocol fixes `attachments` when the item is added, and a
 * patch never carries them.
 */
export function wireToolImageReferences(
  delta: ExecutionSessionDelta,
): { itemId: string; attachments: ExecutionToolAttachment[] } | null {
  if (
    delta.kind !== 'conversation.item.add' ||
    delta.item.kind !== 'tool-result' ||
    !delta.item.attachments?.length
  )
    return null
  return { itemId: delta.item.id, attachments: delta.item.attachments }
}

/**
 * The attribution fields of a local item or patch that name something, as the
 * wire spells them (CONVERSATION_ITEM_ATTRIBUTION_FIELDS).
 */
function wireAttribution(source: {
  agentRunId?: string | null
  taskId?: string | null
}): { agentRunId?: string; taskId?: string } {
  return {
    ...(source.agentRunId ? { agentRunId: source.agentRunId } : {}),
    ...(source.taskId ? { taskId: source.taskId } : {}),
  }
}

/**
 * Translates a wire conversation item into the local draft. `turnId` is null
 * because the wire carries no turn attribution; the session service assigns
 * the real one when it persists the item. The agent run and task that made
 * the item do travel, and are kept only when the wire names them, so a main
 * agent's item reads exactly as it did before protocol 0.19.
 */
function toLocalConversationItemDraft(
  item: ExecutionConversationItem,
): ConversationItemDraft {
  const base = {
    id: item.id,
    turnId: null,
    ...pickDefined<Pick<ConversationItem, 'agentRunId' | 'taskId'>>(
      item,
      CONVERSATION_ITEM_ATTRIBUTION_FIELDS,
    ),
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
    case 'tool-result': {
      const attachmentOmissions = readToolAttachmentOmissions(
        item.attachmentOmissions,
      )
      return {
        ...base,
        kind: 'tool-result',
        toolName: item.toolName,
        relatedItemId: item.relatedItemId,
        outputText: item.outputText,
        ...(attachmentOmissions ? { attachmentOmissions } : {}),
      }
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
  return pickDefined(patch, [
    ...LOCAL_CONVERSATION_ITEM_PATCH_FIELDS,
    ...CONVERSATION_ITEM_ATTRIBUTION_FIELDS,
  ]) as Partial<ConversationItem>
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

/**
 * Whether every field of a wire shape is accounted for: `true` when it is,
 * and otherwise a type naming the fields nobody placed, so assigning `true`
 * fails with those names in the message.
 */
type Accounted<Unplaced> = [Unplaced] extends [never]
  ? true
  : { unplaced: Unplaced }

/**
 * Whether two types are the same type, not merely assignable each way: the
 * comparison TypeScript makes between two generic signatures is its identity
 * relation, so an optional field one side has and the other lacks is a
 * difference here, where mutual assignability lets it through. `true` when
 * they are the same, otherwise a type naming both, so assigning `true` fails
 * with the two shapes in the message.
 */
type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : { differs: [A, B] }

/**
 * The exhaustive inventory (MAR-3684). Each line compiles only while every
 * field of its wire shape is either mapped above or named on its unmapped
 * list with a reason, so the next protocol release that adds a field is a
 * type error here until someone decides where it goes. A field is never
 * dropped by an allowlist that simply did not know it.
 */
export const EXECUTION_HOST_WIRE_INVENTORY_IS_EXHAUSTIVE: {
  items: Accounted<
    Exclude<
      WireConversationItemField,
      | 'id'
      | 'kind'
      | 'request'
      | (typeof LOCAL_CONVERSATION_ITEM_PATCH_FIELDS)[number]
      | (typeof CONVERSATION_ITEM_ATTRIBUTION_FIELDS)[number]
      | ConversationItemAddOnlyField
      | (typeof EXECUTION_HOST_FETCHED_WIRE_ITEM_FIELDS)[number]
      | (typeof EXECUTION_HOST_UNMAPPED_WIRE_ITEM_FIELDS)[number]
    >
  >
  sessionPatch: Accounted<
    Exclude<
      WireSessionPatchField,
      | (typeof LOCAL_SESSION_PATCH_FIELDS)[number]
      | (typeof EXECUTION_HOST_UNMAPPED_WIRE_SESSION_PATCH_FIELDS)[number]
    >
  >
  evidence: Accounted<
    Exclude<
      keyof Extract<ExecutionSessionDelta, { kind: 'evidence' }>,
      | 'kind'
      | 'evidence'
      | (typeof EXECUTION_HOST_UNMAPPED_WIRE_EVIDENCE_FIELDS)[number]
    >
  >
  provider: Accounted<
    Exclude<
      keyof ExecutionProvider,
      | (typeof EXECUTION_HOST_READ_PROVIDER_FIELDS)[number]
      | (typeof EXECUTION_HOST_UNREAD_PROVIDER_FIELDS)[number]
    >
  >
  providerModel: Accounted<
    Exclude<
      keyof ExecutionProviderModel,
      | (typeof EXECUTION_HOST_READ_PROVIDER_MODEL_FIELDS)[number]
      | (typeof EXECUTION_HOST_UNREAD_PROVIDER_MODEL_FIELDS)[number]
    >
  >
  snapshot: Accounted<
    Exclude<
      keyof ExecutionSessionSnapshot,
      | (typeof EXECUTION_HOST_READ_SNAPSHOT_FIELDS)[number]
      | (typeof EXECUTION_HOST_UNREAD_SNAPSHOT_FIELDS)[number]
    >
  >
  /**
   * Every omission code a host may send is one the local item counts under
   * the same name (MAR-4274); `download-failed` is the local item's own.
   */
  toolAttachmentOmissionCodes: Accounted<
    Exclude<ExecutionToolAttachmentOmissionCode, ToolAttachmentOmissionCode>
  >
  /**
   * The evidence the wire carries is Convergence's own, copied into the
   * protocol (protocol 0.19), and handed to `HarnessEvidenceService.apply`
   * whole. The two assignments in the delta mappings only prove the copies
   * assignable each way, which an optional field added to one side survives
   * (a host's `exitCode?` on a task patch would compile and then be dropped
   * by the fold). These are exact: the union, and the two rows its facts
   * patch.
   */
  evidenceShape: Same<WireHarnessEvidence, HarnessEvidence>
  sessionTask: Same<WireSessionTask, SessionTask>
  sessionAgentRun: Same<WireSessionAgentRun, SessionAgentRun>
  /**
   * The provider catalogue's vocabularies (MAR-4272). A host's permission
   * choices and interaction kinds are copied into the app's own types, not
   * translated, which is only sound while the sets are the same: a sandbox or
   * a request kind one side gains is a type error here rather than a choice
   * the composer offers and the host has never heard of.
   */
  permissionPreset: Same<ExecutionPermissionPreset, SessionPermissionPreset>
  codexApprovalPolicy: Same<ExecutionCodexApprovalPolicy, CodexApprovalPolicy>
  codexSandboxMode: Same<ExecutionCodexSandboxMode, CodexSandboxMode>
  claudePermissionMode: Same<
    ExecutionClaudePermissionMode,
    ClaudeCodePermissionMode
  >
  interactionRequestKind: Same<
    ExecutionInteractionRequestKind,
    ProviderInteractionRequestKind
  >
  /** Every field of the catalogue's permissions, usage and credits, placed. */
  providerPermissions: Accounted<
    Exclude<
      | keyof ExecutionProviderPermissions
      | keyof NonNullable<ExecutionProviderPermissions['codex']>
      | keyof NonNullable<ExecutionProviderPermissions['claudeCode']>,
      | keyof ProviderHostPermissions
      | keyof NonNullable<ProviderHostPermissions['codex']>
      | keyof NonNullable<ProviderHostPermissions['claudeCode']>
      | (typeof EXECUTION_HOST_UNREAD_PROVIDER_PERMISSION_FIELDS)[number]
    >
  >
  providerUsage: Accounted<
    Exclude<keyof ExecutionProviderUsage, keyof ProviderHostUsage>
  >
  providerUsageWindow: Accounted<
    Exclude<keyof ExecutionProviderUsageWindow, keyof ProviderHostUsageWindow>
  >
  providerUsageCredits: Accounted<
    Exclude<keyof ExecutionProviderUsageCredits, keyof ProviderHostUsageCredits>
  >
  providerUsageVocabulary: Same<
    [
      ExecutionProviderUsage['source'],
      NonNullable<ExecutionProviderUsage['status']>,
      ExecutionProviderUsageWindow['span'],
    ],
    [
      ProviderHostUsage['source'],
      NonNullable<ProviderHostUsage['status']>,
      ProviderHostUsageWindow['span'],
    ]
  >
  capabilities: Accounted<
    Exclude<
      KnownExecutionProtocolCapability,
      | (typeof EXECUTION_HOST_CHECKED_CAPABILITIES)[number]
      | keyof typeof EXECUTION_HOST_UNCHECKED_CAPABILITIES
    >
  >
} = {
  items: true,
  sessionPatch: true,
  evidence: true,
  provider: true,
  providerModel: true,
  snapshot: true,
  toolAttachmentOmissionCodes: true,
  evidenceShape: true,
  sessionTask: true,
  sessionAgentRun: true,
  permissionPreset: true,
  codexApprovalPolicy: true,
  codexSandboxMode: true,
  claudePermissionMode: true,
  interactionRequestKind: true,
  providerPermissions: true,
  providerUsage: true,
  providerUsageWindow: true,
  providerUsageCredits: true,
  providerUsageVocabulary: true,
  capabilities: true,
}

/**
 * The provider fields Convergence reads, of the ones the protocol's catalogue
 * (`ExecutionProvider`) names, from the daemon's `GET /v0/providers` through
 * `parseRemoteExecutionHostProviders` (MAR-4272).
 *
 * - `effortLevels` (0.18) is read folded into each model's `efforts`, which is
 *   where the protocol's decoder puts a provider's levels for a model that
 *   names none of its own. The remote descriptor's effort choice is the
 *   host's.
 * - `permissions` (0.27, `effectiveSandboxModes` 0.29) are the remote
 *   composer's permission choices, and a Codex sandbox a host runs as another
 *   is said before the start (`describeHostSandbox`).
 * - `usage` (0.30, `credits` 0.31) is shown beside the provider, to anyone
 *   (Marcin, 18 Oct).
 */
export const EXECUTION_HOST_READ_PROVIDER_FIELDS = [
  'id',
  'label',
  'available',
  'authenticated',
  'effortLevels',
  'models',
  'permissions',
  'interactions',
  'usage',
] as const satisfies readonly (keyof ExecutionProvider)[]

/**
 * Provider catalogue fields Convergence does not read.
 *
 * - `attachmentKinds` (0.22): the remote descriptor turns every attachment
 *   off, and Convergence sends no inline attachment yet (MAR-1415).
 * - `account` (0.22): withheld, not overlooked. It is personal data, and the
 *   account stays visible only to the super-admin (Marcin, 18 Oct). A client
 *   holding a daemon token cannot tell whether the person in front of it is
 *   one, so `parseRemoteExecutionHostProviders` drops it where the catalogue
 *   is read, and it never reaches the renderer.
 */
export const EXECUTION_HOST_UNREAD_PROVIDER_FIELDS = [
  'attachmentKinds',
  'account',
] as const satisfies readonly (keyof ExecutionProvider)[]

/**
 * Permission fields of the catalogue Convergence does not read: Codex's
 * reviewers and collaboration modes (0.27). The composer has no control for
 * either, and a session it starts names neither, so the host's default
 * stands (MAR-4272).
 */
export const EXECUTION_HOST_UNREAD_PROVIDER_PERMISSION_FIELDS = [
  'approvalsReviewers',
  'collaborationModes',
] as const

/**
 * The model fields Convergence reads, from the catalogue's model list: every
 * one, the efforts included (MAR-4272).
 */
export const EXECUTION_HOST_READ_PROVIDER_MODEL_FIELDS = [
  'slug',
  'label',
  'defaultEffort',
  'efforts',
] as const satisfies readonly (keyof ExecutionProviderModel)[]

/** Model fields Convergence does not read: none since MAR-4272. */
export const EXECUTION_HOST_UNREAD_PROVIDER_MODEL_FIELDS =
  [] as const satisfies readonly (keyof ExecutionProviderModel)[]

/**
 * The session-snapshot fields Convergence reads
 * (`GET /v0/execution/sessions/:id`): the session it is about, which every
 * read checks, the tasks still running when a reattach resumes
 * (`readSnapshotRunningTasks`, MAR-3987), and where the host prepared it
 * (`parseRemoteSessionWorkspaceInfo`).
 */
export const EXECUTION_HOST_READ_SNAPSHOT_FIELDS = [
  'sessionId',
  'runningTasks',
  'workspace',
] as const satisfies readonly (keyof ExecutionSessionSnapshot)[]

/**
 * Session-snapshot fields Convergence does not read.
 *
 * - `conversation`, `turns`, `lastSeq`, `status`, `attention`, `activity`,
 *   `continuationToken`, `contextWindow`, `prUrl`: a reattach replays the
 *   event log from its cursor (`Last-Event-ID`), which says each of these as
 *   it happened, and the record already holds what came before the cursor.
 *   Reading the projection beside the log would be a second account of the
 *   same facts to reconcile.
 * - `protocolVersion`: checked on every envelope the stream delivers.
 * - `providerId`: the record's own, the provider the session started with.
 * - `commandable`: a command the host will not take is answered as such, and
 *   `postCommand` reports it undelivered.
 * - `metadata`, `roomId`: Convergence sends no session metadata and has no
 *   rooms.
 * - `model`, `effort` (0.17), `permissionConfig` (0.27): Convergence changes
 *   none of them on a running session, and the record keeps what the start
 *   carried, as a local session's does. A change another client, or the host
 *   leaving plan mode after a plan is approved, makes is not shown here
 *   (MAR-4273).
 */
export const EXECUTION_HOST_UNREAD_SNAPSHOT_FIELDS = [
  'conversation',
  'turns',
  'lastSeq',
  'status',
  'attention',
  'activity',
  'continuationToken',
  'contextWindow',
  'prUrl',
  'protocolVersion',
  'providerId',
  'commandable',
  'metadata',
  'roomId',
  'model',
  'effort',
  'permissionConfig',
] as const satisfies readonly (keyof ExecutionSessionSnapshot)[]

/**
 * The capability ids Convergence reads off a host's `/health` and acts on:
 * `projects.v1` gates the host's Project listing (MAR-2689), and
 * `commands.stopTask.v1` the panel's Stop on one task (MAR-3684).
 */
export const EXECUTION_HOST_CHECKED_CAPABILITIES = [
  'projects.v1',
  EXECUTION_HOST_STOP_TASK_CAPABILITY,
] as const satisfies readonly KnownExecutionProtocolCapability[]

/**
 * Every other capability id the protocol knows, with why Convergence does not
 * check it. Most name a route or a command it never uses, so there is nothing
 * to gate; the ones that change what it reads say how it reads them anyway.
 */
export const EXECUTION_HOST_UNCHECKED_CAPABILITIES = {
  'commands.approval':
    'Approve and deny are sent as the user answers; a host that refuses one is reported undelivered.',
  'events.replay':
    'Assumed: every reattach resumes by Last-Event-ID, and every agents-daemon followed advertises it.',
  'sessions.metadata': 'Convergence sends no session metadata.',
  'workspaces.materialize':
    'Assumed: a remote start carries a workspace, and every agents-daemon followed advertises it.',
  'callbacks.status':
    'Convergence registers no status callback; it follows the event stream.',
  'automation.create-pr':
    'Never sent (EXECUTION_HOST_NEVER_SENT_START_REQUEST_FIELDS).',
  'attachments.inline-image':
    'Convergence sends no inline attachment yet (MAR-1415).',
  'commands.cancelQueued': 'Convergence sends no cancel-queued command.',
  'interactions.structured':
    'Answers are sent unchecked; every agents-daemon followed advertises it (MAR-4276).',
  'turns.fileChanges':
    'File changes are read when they arrive; there is nothing to gate.',
  'turns.fileChanges.combined': 'As turns.fileChanges.',
  'turns.fileChanges.multiRepo':
    'repoRoot is read when present; absent is the root repository (MAR-2577).',
  'rooms.v1': 'Convergence has no rooms.',
  'research.evidence': 'Convergence sends no research evidence pack.',
  'projects.v2': 'Convergence reads the projects.v1 listing.',
  'environments.v1':
    'Never sent (EXECUTION_HOST_NEVER_SENT_START_REQUEST_FIELDS).',
  'deltas.append.v1':
    'Convergence does not negotiate ?deltas=append, so full text always arrives.',
  'commands.actor.v1':
    'Never sent (EXECUTION_HOST_NEVER_SENT_START_REQUEST_FIELDS).',
  'items.author.v1':
    'author and clientMessageId are unmapped (EXECUTION_HOST_UNMAPPED_WIRE_ITEM_FIELDS).',
  'sessions.modelSelection.v1':
    'Convergence changes no running session model (EXECUTION_HOST_UNMAPPED_WIRE_SESSION_PATCH_FIELDS).',
  'sessions.permissionModes.v1':
    'Convergence sends no session PATCH (MAR-4273).',
  'oneshot.v1':
    'A remote one-shot is refused locally (supportsOneShot: false).',
  'sessions.resident.v1':
    'answered, runningTasks and harness turns are read from any host that sends them (MAR-3987).',
  'evidence.v1':
    'Evidence is applied from any host that sends it; one that sends none leaves the counts to runningTasks.',
  'host.profile.v1': 'Convergence does not read GET /v0/host.',
  'devices.iosSimulator.v1': 'Convergence does not read the host profile.',
  'devices.androidEmulator.v1': 'Convergence does not read the host profile.',
  'start.requires.v1':
    'Never sent (EXECUTION_HOST_NEVER_SENT_START_REQUEST_FIELDS).',
  'attachments.inline-file.v1':
    'Convergence sends no inline attachment yet (MAR-1415).',
  'items.toolAttachments.v1':
    'Tool-result images are fetched from any host that sends them (EXECUTION_HOST_FETCHED_WIRE_ITEM_FIELDS, MAR-4274).',
  'tasks.output.v1': 'A remote task output tail is not read yet (MAR-4275).',
  'providers.usage.v1':
    'Usage is read wherever the catalogue carries it; a host without the capability sends none, which reads as unknown (MAR-4272).',
} as const satisfies Record<
  Exclude<
    KnownExecutionProtocolCapability,
    (typeof EXECUTION_HOST_CHECKED_CAPABILITIES)[number]
  >,
  string
>
