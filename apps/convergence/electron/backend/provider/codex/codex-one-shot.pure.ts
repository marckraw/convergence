import type {
  CodexApprovalPolicy,
  CodexSandboxMode,
  OneShotInput,
} from '../provider.types'

/**
 * The permission profile every helper turn runs under (MAR-2824 R3).
 *
 * Naming and extraction read a conversation and answer with text; they never
 * touch the machine. Inheriting the session's profile would put a second,
 * invisible agent on the user's workspace with the user's write rights and no
 * transcript to show for it, so the profile is a constant here rather than an
 * argument: least privilege is not a decision a caller gets to make.
 */
export const CODEX_ONE_SHOT_PERMISSION: {
  approvalPolicy: CodexApprovalPolicy
  sandbox: CodexSandboxMode
} = {
  approvalPolicy: 'never',
  sandbox: 'read-only',
}

/** What a caller is told when it never said whose subscription it spends. */
export const CODEX_ONE_SHOT_ACCOUNT_REQUIRED =
  'codex oneShot requires providerAccountId (pass null for the ambient login)'

/**
 * Whether a caller stated which account its helper turn runs on (R5).
 *
 * `undefined` is the mistake, and the key being absent is only one way to
 * reach it: a caller spreading an optional field it never filled writes the
 * key and still says nothing about whose subscription pays. An explicit `null`
 * is an answer: the ambient `~/.codex` login, which is most people's only
 * Codex account. One predicate because two sites refuse: the provider, before
 * it resolves a host for a call it is about to reject, and the helper, for
 * anyone who reaches it directly.
 */
export function statesProviderAccount(input: object): boolean {
  const { providerAccountId } = input as { providerAccountId?: string | null }
  return providerAccountId !== undefined
}

/**
 * The `thread/start` params for a helper turn.
 *
 * `ephemeral: true` is the load-bearing flag: measured on codex-cli 0.153.4,
 * a thread started with it runs a full turn and still leaves no rollout, so a
 * lost connection has nothing to resume and naming can only ever be retried
 * from the top (R4).
 */
export function buildCodexOneShotThreadParams(
  input: Pick<OneShotInput, 'workingDirectory'>,
): Record<string, unknown> {
  return {
    cwd: input.workingDirectory,
    approvalPolicy: CODEX_ONE_SHOT_PERMISSION.approvalPolicy,
    sandbox: CODEX_ONE_SHOT_PERMISSION.sandbox,
    ephemeral: true,
  }
}

/** The `turn/start` params for a helper turn: the caller's model, our thread. */
export function buildCodexOneShotTurnParams(
  threadId: string,
  input: Pick<
    OneShotInput,
    'prompt' | 'modelId' | 'effort' | 'serviceTier' | 'outputSchema'
  >,
): Record<string, unknown> {
  return {
    threadId,
    model: input.modelId,
    ...(input.effort ? { effort: input.effort } : {}),
    ...(input.serviceTier ? { serviceTier: input.serviceTier } : {}),
    ...(input.outputSchema !== undefined && input.outputSchema !== null
      ? { outputSchema: input.outputSchema }
      : {}),
    input: [{ type: 'text', text: input.prompt }],
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null
}

function readText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** The thread id in a `thread/start` result, in either shape the server uses. */
export function readCodexOneShotThreadId(result: unknown): string | null {
  const record = asRecord(result)
  if (!record) return null
  const thread = asRecord(record.thread)
  return readText(thread?.id) ?? readText(record.threadId)
}

/**
 * Whether a notification belongs to this helper's thread.
 *
 * The helper opens its own socket, but that is not what makes its traffic its
 * own: the server broadcasts `thread/*` events down *every* connection
 * (constitution A2), so a private socket still carries other sessions' threads.
 * The thread id is the only thing that separates them — an untagged event is
 * somebody else's until proven ours.
 */
export function isCodexNotificationForThread(
  params: unknown,
  threadId: string,
): boolean {
  return readText(asRecord(params)?.threadId) === threadId
}

/**
 * The turn id in a `turn/start` acknowledgement.
 *
 * Without it the timeout path has nothing to interrupt, and the turn keeps
 * running on a server every other session is also talking to.
 */
export function readCodexOneShotTurnId(result: unknown): string | null {
  const turn = asRecord(asRecord(result)?.turn)
  return readText(turn?.id)
}

/** Streamed agent text, in either delta shape the adapter already parses. */
export function readCodexOneShotDelta(params: unknown): string | null {
  const record = asRecord(params)
  if (!record) return null
  return readText(record.delta) ?? readText(record.textDelta)
}

/** The text of a completed `agentMessage` item, or null for any other item. */
export function readCodexOneShotMessage(params: unknown): string | null {
  const item = asRecord(asRecord(params)?.item)
  if (!item || item.type !== 'agentMessage') return null
  return readText(item.text)
}

/**
 * How a `turn/completed` ended.
 *
 * A turn that failed answers with a status and a reason, and reporting that
 * reason is the difference between "naming is broken" and "the model refused
 * this prompt".
 */
export function readCodexTurnOutcome(
  params: unknown,
): { completed: boolean; reason: string } | null {
  const turn = asRecord(asRecord(params)?.turn)
  if (!turn) return null
  const status = readText(turn.status)
  if (status === 'completed') return { completed: true, reason: status }
  const error = asRecord(turn.error)
  return {
    completed: false,
    reason: readText(error?.message) ?? status ?? 'the server gave no reason',
  }
}
