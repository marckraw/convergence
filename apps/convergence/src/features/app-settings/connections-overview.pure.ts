import type {
  ProviderAccountChatGptApps,
  ProviderAccountChatGptSignIns,
  ProviderAccountConnector,
} from '@/entities/provider-account'

/**
 * One view of which account can reach Figma, Linear and GitHub, and through
 * which app (MAR-3518).
 *
 * A service reaches an account through several apps — a ChatGPT app, a server
 * configured on this Mac for Codex, a claude.ai connector, the Claude Code
 * plugin — and Figma keeps one sign-in per app for each of its users, so
 * connecting it in one place can switch it off in another (MAR-3486). Each
 * path is reported with what its own check observed; nothing here guesses.
 */
export type ConnectionService = 'figma' | 'linear' | 'github'

export const CONNECTION_SERVICES: ReadonlyArray<{
  id: ConnectionService
  label: string
}> = [
  { id: 'figma', label: 'Figma' },
  { id: 'linear', label: 'Linear' },
  { id: 'github', label: 'GitHub' },
]

/**
 * What a path's own check observed, best first: a call answered (`works`),
 * the provider reports it connected without a call (`connected`), it needs
 * signing in again, or it could not be used.
 */
export type ConnectionPathState =
  | 'works'
  | 'connected'
  | 'needs-sign-in'
  | 'failed'

export interface ConnectionPath {
  service: ConnectionService
  /** The app the path goes through, in the panel's words. */
  via: string
  state: ConnectionPathState
  /** Who the call said it is signed in as, or whose link needs signing in. */
  account: string | null
}

const SERVICE_PATTERNS: ReadonlyArray<[ConnectionService, RegExp]> = [
  ['figma', /\bfigma\b/i],
  ['linear', /\blinear\b/i],
  ['github', /\bgithub\b/i],
]

/** The service a server or app name belongs to, or none of the three. */
export function connectionServiceOf(name: string): ConnectionService | null {
  for (const [service, pattern] of SERVICE_PATTERNS)
    if (pattern.test(name)) return service
  return null
}

export const VIA_CHATGPT_APP = 'ChatGPT app'
export const VIA_CODEX_ON_THIS_MAC = 'Codex on this Mac'
export const VIA_CLAUDE_AI = 'claude.ai'
export const VIA_CLAUDE_CODE_PLUGIN = 'Claude Code plugin'
export const VIA_CLAUDE_ON_THIS_MAC = 'Claude on this Mac'

type LiveStatus = 'signed-in' | 'needs-sign-in' | 'failed' | 'unchecked'

function fromLive(status: LiveStatus | 'built-in'): ConnectionPathState {
  switch (status) {
    case 'signed-in':
    case 'built-in':
      return 'works'
    case 'needs-sign-in':
      return 'needs-sign-in'
    case 'failed':
      return 'failed'
    case 'unchecked':
      return 'connected'
  }
}

function fromSaved(
  connector: ProviderAccountConnector,
): ConnectionPathState | null {
  switch (connector.status) {
    case 'ready':
      return 'connected'
    case 'needs-auth':
      return 'needs-sign-in'
    case 'failed':
      return 'failed'
    default:
      // Disabled or unknown: the provider claims nothing, so neither do we.
      return null
  }
}

/**
 * An OpenAI account's paths: its ChatGPT apps (with the sign-in check's
 * answer), and its servers configured on this Mac (the check's answer, else
 * what Codex saved). An app turned off is no path; an app whose tools Codex
 * cannot use is a path that failed.
 */
export function codexConnectionPaths(input: {
  apps: ProviderAccountChatGptApps['apps']
  signIns: ProviderAccountChatGptSignIns | null
  connectors: readonly ProviderAccountConnector[]
}): ConnectionPath[] {
  const paths: ConnectionPath[] = []
  for (const app of input.apps) {
    const service = connectionServiceOf(app.name) ?? connectionServiceOf(app.id)
    if (!service || app.state === 'off') continue
    if (app.state === 'unavailable') {
      paths.push({
        service,
        via: VIA_CHATGPT_APP,
        state: 'failed',
        account: null,
      })
      continue
    }
    const signIn = input.signIns?.signIns.find(
      (entry) => entry.appId === app.id,
    )
    paths.push({
      service,
      via: VIA_CHATGPT_APP,
      state: signIn ? fromLive(signIn.status) : 'connected',
      account: signIn?.account ?? null,
    })
  }
  for (const connector of input.connectors) {
    const service = connectionServiceOf(connector.name)
    if (!service) continue
    const live = input.signIns?.servers.find(
      (entry) => entry.server === connector.name,
    )
    const state = live ? fromLive(live.status) : fromSaved(connector)
    if (!state) continue
    paths.push({
      service,
      via: VIA_CODEX_ON_THIS_MAC,
      state,
      account: live?.account ?? null,
    })
  }
  return paths
}

/**
 * A Claude account's paths, from Claude's own `mcp list`: connected is all it
 * can say without spending a model turn (MAR-3517), so a Claude path never
 * reads `works`.
 */
export function claudeConnectionPaths(
  connectors: readonly ProviderAccountConnector[],
): ConnectionPath[] {
  const paths: ConnectionPath[] = []
  for (const connector of connectors) {
    const service = connectionServiceOf(connector.name)
    const state = fromSaved(connector)
    if (!service || !state) continue
    paths.push({
      service,
      via: connector.name.startsWith('claude.ai ')
        ? VIA_CLAUDE_AI
        : connector.name.startsWith('plugin:')
          ? VIA_CLAUDE_CODE_PLUGIN
          : VIA_CLAUDE_ON_THIS_MAC,
      state,
      account: null,
    })
  }
  return paths
}

const RANK: Record<ConnectionPathState, number> = {
  works: 0,
  connected: 1,
  'needs-sign-in': 2,
  failed: 3,
}

/** One service's cell: its paths, best first, and the best state, or none. */
export function connectionCell(
  paths: readonly ConnectionPath[],
  service: ConnectionService,
): { state: ConnectionPathState | 'none'; paths: ConnectionPath[] } {
  const mine = paths
    .filter((path) => path.service === service)
    .sort((a, b) => RANK[a.state] - RANK[b.state])
  return { state: mine[0]?.state ?? 'none', paths: mine }
}

export type ConnectionTone = 'good' | 'muted' | 'warn'

/** How one path reads in its cell, e.g. "Signed in as m@ef.com · ChatGPT app". */
export function connectionPathLine(path: ConnectionPath): {
  text: string
  tone: ConnectionTone
} {
  switch (path.state) {
    case 'works':
      return {
        text: `${path.account ? `Signed in as ${path.account}` : 'Works'} · ${path.via}`,
        tone: 'good',
      }
    case 'connected':
      return { text: `Connected · ${path.via}`, tone: 'muted' }
    case 'needs-sign-in':
      return { text: `Needs sign-in again · ${path.via}`, tone: 'warn' }
    case 'failed':
      return { text: `Couldn't use it · ${path.via}`, tone: 'warn' }
  }
}

/** "Checked at 10:42", in the viewer's clock, or nothing. */
export function describeConnectionsCheckedAt(
  checkedAt: string | null,
): string | null {
  if (!checkedAt) return null
  const at = new Date(checkedAt)
  if (Number.isNaN(at.getTime())) return null
  return `Checked at ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}
