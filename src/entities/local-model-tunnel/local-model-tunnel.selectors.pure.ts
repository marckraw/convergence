import type {
  LocalModelTunnelProfileWithStatus,
  LocalModelTunnelSnapshot,
  LocalModelTunnelState,
} from './local-model-tunnel.types'

export interface LocalModelTunnelAggregate {
  label: string
  detail: string
  state: LocalModelTunnelState
  visible: boolean
}

const STATE_WEIGHT: Record<LocalModelTunnelState, number> = {
  failed: 5,
  starting: 4,
  external: 3,
  running: 2,
  stopped: 1,
}

export function selectLocalModelTunnelAggregate(
  snapshot: LocalModelTunnelSnapshot | null,
): LocalModelTunnelAggregate {
  const profiles = snapshot?.profiles ?? []
  if (profiles.length === 0) {
    return {
      label: 'Local models',
      detail: 'not configured',
      state: 'stopped',
      visible: false,
    }
  }

  const state = pickAggregateState(profiles)
  if (profiles.length === 1) {
    return {
      label: profiles[0]!.profile.name,
      detail: formatLocalModelTunnelStatusDetail(profiles[0]!),
      state,
      visible: true,
    }
  }

  const runningLike = profiles.filter(
    ({ status }) => status.state === 'running' || status.state === 'external',
  ).length
  const failed = profiles.filter(
    ({ status }) => status.state === 'failed',
  ).length
  const starting = profiles.filter(
    ({ status }) => status.state === 'starting',
  ).length

  return {
    label: 'Local models',
    detail:
      failed > 0
        ? `${failed} failed`
        : starting > 0
          ? `${starting} starting`
          : runningLike > 0
            ? `${runningLike} running`
            : 'stopped',
    state,
    visible: true,
  }
}

export function selectPreferredLocalModelTunnelProfileId(
  profiles: LocalModelTunnelProfileWithStatus[],
): string | null {
  return (
    profiles
      .map((item, index) => ({
        id: item.profile.id,
        index,
        weight: getPreferredProfileWeight(item),
      }))
      .sort((a, b) => b.weight - a.weight || a.index - b.index)[0]?.id ?? null
  )
}

export function formatLocalModelTunnelEndpoint(
  item: LocalModelTunnelProfileWithStatus,
): string {
  const localHost = item.profile.useCustomLocalBindHost
    ? item.profile.localBindHost
    : '127.0.0.1'
  if (item.profile.connectionKind === 'local-runtime') {
    return `${localHost}:${item.profile.localPort} on this Mac`
  }
  if (item.profile.routeCandidates.length > 0) {
    const targets = item.profile.routeCandidates
      .map((route) => route.sshTarget)
      .join(', ')
    return `${localHost}:${item.profile.localPort} -> auto routes: ${targets}`
  }
  return `${localHost}:${item.profile.localPort} -> ${item.profile.sshTarget}:${item.profile.remoteHost}:${item.profile.remotePort}`
}

export function formatLocalModelTunnelConnectionLabel(
  item: LocalModelTunnelProfileWithStatus,
): string {
  if (item.profile.connectionKind === 'local-runtime') return 'This Mac'
  if (
    item.status.activeRouteLabel &&
    (item.status.state === 'running' || item.status.state === 'external')
  ) {
    return item.status.activeRouteLabel
  }
  return item.profile.routeCandidates.length > 0
    ? 'Auto SSH tunnel'
    : 'SSH tunnel'
}

export function formatLocalModelTunnelStatusDetail(
  item: LocalModelTunnelProfileWithStatus,
): string {
  if (
    item.profile.connectionKind === 'ssh-tunnel' &&
    !item.profile.allowExternal &&
    item.status.state === 'stopped' &&
    item.status.health.state === 'healthy'
  ) {
    return 'local port occupied'
  }

  const parts = [formatStateDetail(item.status.state)]
  if (
    item.status.activeRouteLabel &&
    item.status.state !== 'running' &&
    item.status.state !== 'external'
  ) {
    parts.push(item.status.activeRouteLabel)
  }
  if (item.status.health.modelCount !== null) {
    parts.push(`${item.status.health.modelCount} models`)
  }
  if (item.status.health.statusCode !== null) {
    parts.push(`HTTP ${item.status.health.statusCode}`)
  }
  if (item.status.health.latencyMs !== null) {
    parts.push(`${item.status.health.latencyMs}ms`)
  }
  return parts.join(' · ')
}

function pickAggregateState(
  profiles: LocalModelTunnelProfileWithStatus[],
): LocalModelTunnelState {
  return profiles
    .map(({ status }) => status.state)
    .sort((a, b) => STATE_WEIGHT[b] - STATE_WEIGHT[a])[0]!
}

function formatStateDetail(state: LocalModelTunnelState): string {
  switch (state) {
    case 'running':
      return 'running'
    case 'external':
      return 'external'
    case 'starting':
      return 'starting'
    case 'failed':
      return 'failed'
    case 'stopped':
      return 'stopped'
  }
}

function getPreferredProfileWeight(
  item: LocalModelTunnelProfileWithStatus,
): number {
  if (item.status.state === 'running') return 50
  if (item.status.state === 'external') return 45
  if (item.status.state === 'starting') return 40
  if (item.status.state === 'failed') return 30
  if (item.profile.autoStart) return 20
  return 0
}
