/**
 * `@convergence/execution-host-client` — the daemon client core (MAR-2737).
 *
 * Everything an app needs to talk to an agents-daemon over the execution host
 * wire protocol, and nothing about the app doing the talking: the `/health`
 * handshake, the Projects listing, the configuration and capability
 * fingerprints an answer is only true under, the parsers for `/v0/meta`, a
 * start response and a session snapshot, the SSE reader, and the wire trace.
 *
 * Two ports stand where an app would otherwise have to be imported —
 * `EndpointConfigurationSource` and `TokenSource` — and they are structural, so
 * a host app satisfies them with the services it already has and no adapter.
 *
 * What deliberately did NOT come along: the `ProviderExecutionHost` adapter, its
 * registry, the wire mapping that speaks Convergence's session vocabulary, and
 * every catalog row and provider descriptor derived from a listing. Those name
 * a session record, and this package must stay usable by an app that has none
 * (Backpack Studio is the proof). Extraction is by demand: they move when a
 * second app actually needs a session runtime, not before.
 *
 * This file is the package's only entry point. Consumers import from the
 * package name; a deep or relative path into `packages/` is a boundary
 * violation, not a shortcut.
 */

export {
  evaluateHandshake,
  parseDaemonHealth,
  SUPPORTED_DAEMON_API_VERSIONS,
} from './execution-host-handshake.pure'
export type {
  DaemonHealthInfo,
  EndpointConnectionStatus,
  EndpointHandshakeResult,
  MetaProbeOutcome,
  ProviderReadinessDetail,
} from './execution-host-handshake.types'

export {
  DAEMON_HEALTH_FIXTURE_0_26_1,
  DAEMON_HEALTH_FIXTURE_GIT_SHA,
  DAEMON_HEALTH_FIXTURE_VERSION,
  daemonHealthFixtureWithoutDescriptor,
} from './execution-host-health.fixture'

export {
  createStubDaemon,
  DAEMON_META,
  deferred,
  envelope,
  letEverythingQueuedRun,
  track,
  waitUntil,
  type StubDaemon,
} from './execution-host-daemon.fixture'

export {
  describeWireDeltaShape,
  describeWireEventShape,
  describeWireTokenShape,
  type WireDeltaShape,
  type WireEventShape,
  type WireTokenShape,
} from './execution-host-wire-trace.pure'

export {
  advertisesRemoteProjects,
  decodeRemoteProjects,
  REMOTE_PROJECTS_CAPABILITY,
  remoteProjectCatalogFromOutcome,
  remoteProjectsCapability,
  type RemoteProjectsCapability,
  type RemoteProjectsDecode,
} from './remote-project.pure'
export type {
  RemoteProject,
  RemoteProjectCatalog,
  RemoteProjectsOutcome,
} from './remote-project.types'

export {
  createSseParser,
  daemonCapabilitiesFingerprint,
  daemonConfigurationFingerprint,
  parseRemoteExecutionHostMeta,
  parseRemoteExecutionHostStartResponse,
  parseRemoteSessionWorkspaceInfo,
  UNKNOWN_DAEMON_CAPABILITIES,
  UNRESOLVED_DAEMON_CONFIGURATION,
  type RemoteStartEcho,
  type SseEvent,
} from './remote-execution-host.pure'

export {
  RemoteExecutionHostError,
  type RemoteExecutionHostConnection,
  type RemoteExecutionHostConnectionResolver,
  type RemoteExecutionHostErrorKind,
  type RemoteExecutionHostProviderInfo,
  type RemoteSessionPullRequest,
  type RemoteSessionWorkspaceInfo,
} from './remote-execution-host.types'

export {
  AppSettingsRemoteExecutionHostConnectionResolver,
  type EndpointConfigurationSource,
  type TokenSource,
} from './remote-execution-host-connection'
