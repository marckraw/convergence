import {
  DAEMON_HEALTH_FIXTURE_0_26_1,
  evaluateHandshake,
  parseDaemonHealth,
  type EndpointHandshakeResult,
} from '@convergence/execution-host-client'

/**
 * Studio's captured handshake evaluator, retained from the seed (MAR-2737).
 *
 * Tests use this recorded health body as their double; the developer route
 * uses its unreachable evaluation as a simulation. Production connection
 * indicators read the live main-process handshake through connection.api.ts.
 * This helper itself performs no network IO.
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
  status: EndpointHandshakeResult['status']
  headline: string
  daemonVersion: string
  apiVersion: string
  capabilities: string[]
}

export function readCapturedDaemonHandshake(
  unreachable = false,
): StudioHandshakeReading {
  const health = parseDaemonHealth(JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1))
  const handshake: EndpointHandshakeResult = evaluateHandshake(
    unreachable ? null : health,
    unreachable ? 'Simulated unreachable fixture' : null,
    {
      kind: 'ok',
    },
  )
  return {
    status: handshake.status,
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
