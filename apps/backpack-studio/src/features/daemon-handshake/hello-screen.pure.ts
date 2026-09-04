import {
  DAEMON_HEALTH_FIXTURE_0_26_1,
  evaluateHandshake,
  parseDaemonHealth,
  type EndpointHandshakeResult,
} from '@convergence/execution-host-client'

/**
 * The consumability canary, and a boundary anchor (MAR-2737, retained by
 * MAR-2770).
 *
 * It reads a captured `/health` body through the package's own parser and
 * handshake evaluator — the same two functions Convergence runs against a live
 * daemon — and reports what they made of it. No network: the fixture stands in
 * for the daemon.
 *
 * WHAT THIS IS NOW. The hello screen this fed is gone: Studio has a real UI and
 * performs a real handshake in the main process, so `describeHandshakeStatus`'s
 * live successor is `describeDaemonStatus` in `electron/backend/daemon/`. Two
 * jobs kept this module alive rather than deleted with the screen:
 *
 * 1. It is still the canary MAR-2737 built it to be — an assertion, not a
 *    screenshot, that this app can consume the extracted client core.
 * 2. **Convergence's boundary test resolves against this exact path.**
 *    `apps/convergence/workspace-import-ownership.test.ts` names
 *    `src/features/daemon-handshake/hello-screen.pure` as "a real module in the
 *    sibling app Convergence does not declare", and six of its cases assert
 *    that specifiers reaching it fail with "resolves into the 'backpack-studio'
 *    workspace". Delete this file and all six change their answer to "resolves
 *    nowhere" — the cases stop testing what they claim to test, and
 *    Convergence's suite goes red.
 *
 * That coupling is a defect of the test rather than of this file: an app's gate
 * should not depend on a private path in another app. Fixing it means editing
 * `apps/convergence/`, which MAR-2770 forbids outright (another run is
 * rewriting that tree), so it is filed rather than done here.
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
