/**
 * A verbatim, unedited `GET /health` response body, captured on 2026-08-22 from
 * the daemon the installed app is configured against:
 *
 *   curl -s https://agents.backpack.automations.ef.design/health
 *
 * agents-daemon 0.26.1 · f62fd1b2 · apiVersion v0 · executionProtocol v1 with
 * 17 capabilities. The endpoint is unauthenticated, so this trace needed no
 * token and none appears in it.
 *
 * It is pinned as the raw body rather than a re-typed object so the handshake
 * is proved against the daemon's real bytes — including the fields Convergence
 * does not read and the capability ids the package's known-id list does not
 * contain (`deltas.append.v1`, `rooms.v1`, `projects.v1`, `push.v1`).
 */
export const DAEMON_HEALTH_FIXTURE_0_26_1 =
  '{"status":"ok","version":"0.26.1","apiVersion":"v0","gitSha":"f62fd1b2b2cd5046c37487062cadb0985f06289f","buildTime":"2026-08-08T07:38:45Z","uptime":437707,"activeSessions":0,"providers":{"claude":true,"codex":true,"cursor":false,"gemini":false},"providerReadiness":{"claude":{"installed":true,"authenticated":true},"codex":{"installed":true,"authenticated":true},"cursor":{"installed":false,"authenticated":false},"gemini":{"installed":false,"authenticated":false}},"providerCatalog":{"checkedAt":"2026-08-22T14:27:51.151Z","stale":false},"executionProtocol":{"version":1,"capabilities":["commands.approval","commands.cancelQueued","events.replay","interactions.structured","sessions.metadata","workspaces.materialize","callbacks.status","automation.create-pr","attachments.inline-image","turns.fileChanges","turns.fileChanges.combined","turns.fileChanges.multiRepo","research.evidence","deltas.append.v1","rooms.v1","projects.v1","push.v1"]},"sessionDirectory":{"search":true,"stableCursor":true},"transcriptSearch":{"search":true,"state":"ready","indexedSessions":276,"totalSessions":276,"indexedItems":5760,"error":null},"retention":{"sessionRetentionDays":90,"retainedSessions":317,"attachmentBytes":65521577,"lastSweepAt":"2026-08-22T12:52:46.147Z","lastPrunedCount":0,"prunedTotal":0}}'

/** The daemon build this fixture came from, for test names that must say so. */
export const DAEMON_HEALTH_FIXTURE_VERSION = '0.26.1'
export const DAEMON_HEALTH_FIXTURE_GIT_SHA =
  'f62fd1b2b2cd5046c37487062cadb0985f06289f'
