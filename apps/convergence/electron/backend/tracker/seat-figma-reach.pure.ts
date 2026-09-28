import type { SeatFigmaReach } from '../../../src/shared/types/tracker.types'
import type { ProviderAccountChatGptApps } from '../provider-account/provider-account-chatgpt-apps.pure'
import type { ProviderAccountChatGptSignIns } from '../provider-account/provider-account-chatgpt-sign-in.pure'
import type { ProviderAccountConnectorsResult } from '../provider-account/provider-account-mcp.types'

/**
 * Whether a seat's account reaches Figma, from the checks the Connectors
 * panel runs (MAR-3526). Strict on purpose: the answer gates a hard STOP, so
 * only a call that answered for Figma — or, for Claude, Claude's own
 * "Connected", the most it can say without a model turn — counts.
 */
const FIGMA = /\bfigma\b/i

/** The Figma apps among an account's installed ChatGPT apps, by name or id. */
export function figmaAppIds(apps: ProviderAccountChatGptApps): string[] {
  return apps.apps
    .filter((app) => FIGMA.test(app.name) || FIGMA.test(app.id))
    .map((app) => app.id)
}

/** Whether a server name is Figma's. */
export function isFigmaServer(name: string): boolean {
  return FIGMA.test(name)
}

/**
 * An OpenAI account: its ChatGPT Figma app, or Figma configured on this Mac.
 * `cannot-reach` only on a clean answer — a sign-in that needs renewing, or a
 * full read with no Figma in it. A check that couldn't tell (failed or
 * unchecked calls, an apps list that failed, an account without ChatGPT
 * apps) is `unknown`: the issue still stops, but nobody is told a false fix.
 */
export function codexFigmaReach(input: {
  apps: ProviderAccountChatGptApps
  signIns: ProviderAccountChatGptSignIns
}): SeatFigmaReach {
  const figmaApps = new Set(figmaAppIds(input.apps))
  const answers = [
    ...input.signIns.signIns.filter((entry) => figmaApps.has(entry.appId)),
    ...input.signIns.servers.filter((entry) => isFigmaServer(entry.server)),
  ].map((entry) => entry.status)
  if (answers.includes('signed-in')) return 'reaches'
  if (
    input.apps.error !== null ||
    input.apps.requiresChatGpt ||
    input.signIns.error !== null ||
    answers.some((status) => status !== 'needs-sign-in')
  )
    return 'unknown'
  return 'cannot-reach'
}

/**
 * A Claude account: a Figma server Claude's `mcp list` calls connected.
 * `cannot-reach` only when the list read cleanly and its Figma servers need
 * authentication or there are none; a failed server or read is `unknown`.
 */
export function claudeFigmaReach(
  result: ProviderAccountConnectorsResult,
): SeatFigmaReach {
  const figma = result.connectors.filter((entry) => isFigmaServer(entry.name))
  if (figma.some((entry) => entry.status === 'ready')) return 'reaches'
  if (
    result.error !== null ||
    figma.some((entry) => entry.status !== 'needs-auth')
  )
    return 'unknown'
  return 'cannot-reach'
}
