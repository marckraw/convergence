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

/** An OpenAI account: its ChatGPT Figma app, or Figma configured on this Mac. */
export function codexFigmaReach(input: {
  apps: ProviderAccountChatGptApps
  signIns: ProviderAccountChatGptSignIns
}): SeatFigmaReach {
  const figmaApps = new Set(
    input.apps.apps
      .filter((app) => FIGMA.test(app.name) || FIGMA.test(app.id))
      .map((app) => app.id),
  )
  const apps = input.signIns.signIns.filter((entry) =>
    figmaApps.has(entry.appId),
  )
  const servers = input.signIns.servers.filter((entry) =>
    FIGMA.test(entry.server),
  )
  if ([...apps, ...servers].some((entry) => entry.status === 'signed-in'))
    return 'reaches'
  // No answer at all is not a "no": the check itself failed.
  if (input.signIns.error !== null && apps.length + servers.length === 0)
    return 'unknown'
  return 'cannot-reach'
}

/** A Claude account: a Figma server Claude's `mcp list` calls connected. */
export function claudeFigmaReach(
  result: ProviderAccountConnectorsResult,
): SeatFigmaReach {
  const figma = result.connectors.filter((entry) => FIGMA.test(entry.name))
  if (figma.some((entry) => entry.status === 'ready')) return 'reaches'
  if (result.error !== null && figma.length === 0) return 'unknown'
  return 'cannot-reach'
}
