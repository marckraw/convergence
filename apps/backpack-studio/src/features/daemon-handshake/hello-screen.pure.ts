import {
  DAEMON_HEALTH_FIXTURE_0_26_1,
  evaluateHandshake,
  parseDaemonHealth,
  type EndpointHandshakeResult,
} from '@convergence/execution-host-client'

/**
 * The one real thing Backpack Studio does with the client core (MAR-2737).
 *
 * It reads a captured `/health` body through the package's own parser and
 * handshake evaluator — the same two functions Convergence runs against a live
 * daemon — and reports what they made of it. No network: the fixture stands in
 * for the daemon, because this app has no Endpoint, no token and no settings
 * yet, and inventing one would be scope this beat does not own.
 *
 * The point is the *seam*, not the sentence — and the seam is guarded by two
 * things, neither of which is the manifest line. Deleting
 * `@convergence/execution-host-client` from this app's package.json changes
 * nothing here: npm workspaces links every workspace package into the root
 * `node_modules` whether or not anyone declares it, so TypeScript and Vite both
 * still resolve the import. What does guard it:
 *
 * - **The bundler's resolution.** These three symbols have to exist and have to
 *   be reachable at build time. Make the package unresolvable — move its
 *   `src/index.ts` — and this app's typecheck and its build both fail, which is
 *   the proof the monorepo floor was asked for: a second app consuming the
 *   extraction for real, not merely naming it.
 * - **`workspace-manifest.test.ts`**, which reads this app's manifest off disk
 *   and fails when the declaration is gone. It exists precisely because the
 *   compiler cannot notice (MAR-2737).
 */
export interface StudioHandshakeReading {
  headline: string
  daemonVersion: string
  apiVersion: string
  capabilities: string[]
}

export function readCapturedDaemonHandshake(): StudioHandshakeReading {
  const health = parseDaemonHealth(JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1))
  const handshake: EndpointHandshakeResult = evaluateHandshake(health, null, {
    kind: 'ok',
  })
  return {
    headline: describeHandshakeStatus(handshake),
    daemonVersion: handshake.daemonVersion ?? 'unknown',
    apiVersion: handshake.apiVersion ?? 'unknown',
    capabilities: [...handshake.executionProtocolCapabilities].sort(),
  }
}

/**
 * The handshake's status in a sentence, and never a cheerier one than the
 * status earns: `unreachable` and `incompatible` are answers a reader has to be
 * able to tell apart from `connected` at a glance.
 */
export function describeHandshakeStatus(
  handshake: EndpointHandshakeResult,
): string {
  switch (handshake.status) {
    case 'connected':
      return 'The captured daemon shook hands.'
    case 'unauthorized':
      return 'The captured daemon refused the token.'
    case 'incompatible':
      return 'The captured daemon speaks a protocol this build cannot read.'
    case 'unreachable':
      return 'The captured daemon did not answer.'
  }
}
