import { describeChatGptAppsFailure } from './provider-account-chatgpt-apps.pure'

/**
 * What the panel can say about one ChatGPT app's sign-in (MAR-3470).
 *
 * Nothing Codex lists tells sign-in health: `callable`, the directory's
 * `isAccessible` and the tool catalog's `link_id` are all present for an app
 * whose link needs signing in again (measured 2026-09-27 on four accounts).
 * The only witness is a call to one of the app's tools, so every status here
 * except `built-in` and `unchecked` is something a call just observed.
 */
export type ChatGptAppSignInStatus =
  | 'signed-in'
  | 'needs-sign-in'
  | 'failed'
  | 'built-in'
  | 'unchecked'

export interface ChatGptAppSignIn {
  appId: string
  status: ChatGptAppSignInStatus
  /** Who the app is linked to, as the check or the link itself names it. */
  account: string | null
  /** One sentence for `failed`; null otherwise. */
  reason: string | null
}

export interface ProviderAccountChatGptSignIns {
  providerAccountId: string
  /** When the checks ran (ISO); null when nothing was checked. */
  checkedAt: string | null
  signIns: ChatGptAppSignIn[]
  error: string | null
}

/** A `codex_apps` tool as `mcpServerStatus/list` reports it. Non-secret. */
export interface CodexAppTool {
  name: string
  annotations?: {
    readOnlyHint?: boolean | null
    destructiveHint?: boolean | null
  } | null
  inputSchema?: { required?: string[] | null } | null
  _meta?: {
    connector_id?: string | null
    link_owner_profile?: { email?: string | null; name?: string | null } | null
  } | null
}

export interface ChatGptSignInProbe {
  tool: string
  arguments: Record<string, unknown>
  /** Whether the tool answers who you are, so its answer names the account. */
  identity: boolean
}

/**
 * Read-only "who am I" calls, by the tool's full `codex_apps` name. Each was
 * read in the live catalog on 2026-09-27; `linear.get_user` requires a query.
 */
export const CHATGPT_IDENTITY_PROBES: Readonly<
  Record<string, Readonly<Record<string, unknown>>>
> = {
  'figma.whoami': {},
  'github.get_profile': {},
  'linear.get_user': { query: 'me' },
  'atlassian_rovo_legacy.atlassianUserInfo': {},
}

/**
 * A tool whose whole job is "who am I", by the last segment of its name.
 * Anchored, so `get_company_profile` or `list_viewers` never qualify.
 */
const IDENTITY_NAME =
  /[._](?:whoami|who_am_i|get_current_user|current_user|get_me|me|userinfo|user_info|get_viewer)$/i

/** OpenAI's own apps (Hotline, Plugin Management…) need no user sign-in. */
export function isBuiltInChatGptApp(appId: string): boolean {
  return appId.startsWith('connector_openai_')
}

export function groupCodexAppTools(
  tools: CodexAppTool[],
): Map<string, CodexAppTool[]> {
  const byApp = new Map<string, CodexAppTool[]>()
  for (const tool of tools) {
    const appId = tool._meta?.connector_id
    if (!appId) continue
    byApp.set(appId, [...(byApp.get(appId) ?? []), tool])
  }
  return byApp
}

/** Whom the app's link belongs to, as ChatGPT records it; not proof it works. */
export function chatGptAppLinkOwner(tools: CodexAppTool[]): string | null {
  for (const tool of tools) {
    const owner = tool._meta?.link_owner_profile
    const label = owner?.email || owner?.name
    if (label) return label
  }
  return null
}

/**
 * The one call that tests an app's sign-in, or none (MAR-3470).
 *
 * Only a "who am I" call: a known identity tool, else one whose name says it
 * is exactly that, read-only, non-destructive and needing no arguments. Any
 * other tool of the app would also meet a broken link, but "read-only" is the
 * vendor's word and a list or an export has no bound on what it pulls, so an
 * app without a who-am-I call is left unchecked rather than probed blind.
 */
export function chooseChatGptSignInProbe(
  tools: CodexAppTool[],
): ChatGptSignInProbe | null {
  for (const tool of tools) {
    const args = CHATGPT_IDENTITY_PROBES[tool.name]
    if (args) return { tool: tool.name, arguments: { ...args }, identity: true }
  }
  const named = tools
    .filter(
      (tool) =>
        IDENTITY_NAME.test(tool.name) &&
        tool.annotations?.readOnlyHint === true &&
        tool.annotations?.destructiveHint !== true &&
        !tool.inputSchema?.required?.length,
    )
    .sort((a, b) => a.name.localeCompare(b.name))[0]
  return named ? { tool: named.name, arguments: {}, identity: true } : null
}

/** ChatGPT's words for a link that needs signing in again (measured). */
const REAUTH_WORDS = /requires? reauthenticat|reauthentication required/i
const REAUTH_ACTION = 'TRIGGER_REAUTHENTICATION'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** The tool's answer as data: structured content, else JSON in its text. */
function readToolPayload(response: unknown): {
  data: Record<string, unknown> | null
  text: string
} {
  const record = asRecord(response)
  const structured = asRecord(record?.structuredContent)
  const texts = (Array.isArray(record?.content) ? record.content : [])
    .map((part) => asRecord(part)?.text)
    .filter((text): text is string => typeof text === 'string')
  let data = structured
  if (!data && texts[0]) {
    try {
      data = asRecord(JSON.parse(texts[0]))
    } catch {
      data = null
    }
  }
  return {
    data,
    text: [structured ? JSON.stringify(structured) : '', ...texts].join('\n'),
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** "Name (email)", "email" or "name" from an identity tool's answer. */
export function describeChatGptIdentity(
  data: Record<string, unknown> | null,
): string | null {
  const person = asRecord(data?.user) ?? asRecord(data?.viewer) ?? data
  if (!person) return null
  const name =
    text(person.handle) ??
    text(person.name) ??
    text(person.displayName) ??
    text(person.nickname) ??
    text(person.login)
  const email = text(person.email)
  if (name && email && name !== email) return `${name} (${email})`
  return email ?? name
}

function describeThrown(error: unknown): string {
  if (error instanceof Error) return error.message
  const message = asRecord(error)?.message
  if (typeof message === 'string') return message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error) ?? 'no reason'
  } catch {
    return 'no reason'
  }
}

/**
 * What one probe observed (MAR-3470). "Needs sign-in again" only on ChatGPT's
 * own re-authentication signal (the `TRIGGER_REAUTHENTICATION` action or its
 * words); a bare `UNAUTHORIZED` can be a permission refusal that signing in
 * again would not fix, so it is "couldn't check" with its reason.
 */
export function classifyChatGptSignInProbe(
  outcome: { response: unknown } | { error: unknown },
  probe: Pick<ChatGptSignInProbe, 'identity'>,
): Pick<ChatGptAppSignIn, 'status' | 'account' | 'reason'> {
  const failed = (reason: string) => ({
    status: 'failed' as const,
    account: null,
    reason: describeChatGptAppsFailure(reason),
  })
  const needsSignIn = {
    status: 'needs-sign-in' as const,
    account: null,
    reason: null,
  }
  if ('error' in outcome) {
    const message = describeThrown(outcome.error)
    return REAUTH_WORDS.test(message) ? needsSignIn : failed(message)
  }
  const response = asRecord(outcome.response)
  const answered =
    response !== null &&
    (Array.isArray(response.content) || asRecord(response.structuredContent))
  if (!answered) return failed('Codex returned no answer from the app.')
  const { data, text: body } = readToolPayload(response)
  if (response.isError === true) {
    const action = asRecord(data?.error_data)?.action
    if (action === REAUTH_ACTION || REAUTH_WORDS.test(body)) return needsSignIn
    return failed(text(data?.error) ?? body)
  }
  return {
    status: 'signed-in',
    account: probe.identity ? describeChatGptIdentity(data) : null,
    reason: null,
  }
}
