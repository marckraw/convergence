/**
 * The daemon-handshake slice's public API (MAR-2737).
 *
 * Everything outside this feature reaches it through this file and nothing
 * else — the FSD-lite law Convergence has always followed, now enforced for
 * every app's renderer rather than only Convergence's. Studio claims no `@/`
 * alias of its own, so its cross-slice imports are relative, and the rule
 * rejects both spellings alike.
 */
export { HelloScreen } from './hello-screen.presentational'
