/** Non-secret projections of Codex 0.157's app protocol. */
export interface InstalledChatGptApp {
  id: string
  runtimeName: string | null
  enabled: boolean
  callable: boolean
}

/** What `app/read` says about one app: its name and its ChatGPT page. */
export interface ChatGptAppMetadata {
  id: string
  name: string
  installUrl: string | null
}

export type ChatGptAppState = 'available' | 'unavailable' | 'off'

export interface ProviderAccountChatGptApps {
  providerAccountId: string
  apps: Array<{ id: string; name: string; state: ChatGptAppState }>
  requiresChatGpt: boolean
  error: string | null
}

/** Where "Browse apps on ChatGPT" goes: a fixed page, never a renderer URL. */
export const CHATGPT_APPS_BROWSE_URL = 'https://chatgpt.com/apps'

/** `app/read` accepts at most this many ids per request (Codex 0.157). */
export const CHATGPT_APP_READ_LIMIT = 100

/** The longest reason a panel line carries; a foreign body is not a sentence. */
export const CHATGPT_APPS_REASON_LIMIT = 200

/** Availability is policy/tool visibility, never an authorization-health probe. */
export function chatGptAppState(
  installed: InstalledChatGptApp,
): ChatGptAppState {
  if (!installed.enabled) return 'off'
  return installed.callable ? 'available' : 'unavailable'
}

/**
 * The panel's rows come from Codex's installed runtime snapshot, never from
 * ChatGPT's app directory (MAR-3485).
 *
 * The directory holds ~4,570 apps behind an address Cloudflare's bot check
 * guards; reading it page by page with `forceRefetch` re-downloaded all of it
 * for every page. Measured on four accounts, every app the directory marked
 * accessible was also installed, while the installed snapshot also carries
 * custom apps and Codex's own that the directory does not mark accessible.
 * `app/read` supplies canonical names; the runtime name is the fallback.
 */
export function selectChatGptApps(
  installed: InstalledChatGptApp[],
  metadata: ChatGptAppMetadata[],
): ProviderAccountChatGptApps['apps'] {
  const names = new Map(metadata.map((app) => [app.id, app.name]))
  const unique = new Map(installed.map((app) => [app.id, app]))
  return [...unique.values()]
    .map((app) => ({
      id: app.id,
      name: names.get(app.id) || app.runtimeName || app.id,
      state: chatGptAppState(app),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

/** Splits ids into `app/read`-sized requests, first-seen order, no repeats. */
export function chatGptAppReadBatches(ids: string[]): string[][] {
  const unique = [...new Set(ids)]
  const batches: string[][] = []
  for (let start = 0; start < unique.length; start += CHATGPT_APP_READ_LIMIT)
    batches.push(unique.slice(start, start + CHATGPT_APP_READ_LIMIT))
  return batches
}

/** A well-formed tag; "a < b" or "limit < body size" is prose, not markup. */
const MARKUP = /<(?:!doctype|!--|\/?[a-z][a-z0-9-]*)(?:\s[^<>]*)?\/?>/i
/** Cloudflare's own markers; its "Just a moment" title counts only inside a page. */
const BOT_CHECK = /cf_chl|cf-mitigated|challenge-platform/i
const BOT_CHECK_TITLE = /just a moment/i

/**
 * One readable reason for a failed read (MAR-3485).
 *
 * Codex forwards ChatGPT's response body inside its error, and Cloudflare's
 * bot check answers with a whole HTML page. A page is never a reason: a bot
 * check says so in one sentence, any other markup is cut away with what
 * follows it, and the words that remain (every line, whitespace collapsed,
 * so a "Caused by" is kept) are capped at {@link CHATGPT_APPS_REASON_LIMIT}
 * characters.
 */
export function describeChatGptAppsFailure(message: string): string {
  const status = /status (\d{3})/i.exec(message)?.[1]
  const markup = MARKUP.exec(message)
  if (BOT_CHECK.test(message) || (markup && BOT_CHECK_TITLE.test(message)))
    return `ChatGPT's bot check refused the request${status ? ` (${status})` : ''}. The apps themselves may still work in conversations. Try Refresh in a minute.`
  const text = (markup ? message.slice(0, markup.index) : message)
    .replace(/\s+/g, ' ')
    .replace(/[\s:]+$/, '')
    .trim()
  const reason =
    text.length > CHATGPT_APPS_REASON_LIMIT
      ? `${text.slice(0, CHATGPT_APPS_REASON_LIMIT - 1).trimEnd()}…`
      : text
  if (markup)
    return reason
      ? `${reason} (ChatGPT answered with a web page).`
      : 'ChatGPT answered with a web page and no reason. Try Refresh.'
  return reason || 'Codex gave no reason. Try Refresh.'
}
