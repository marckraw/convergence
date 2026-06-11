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

export function formatLocalModelTunnelEndpoint(
  item: LocalModelTunnelProfileWithStatus,
): string {
  const localHost = item.profile.useCustomLocalBindHost
    ? item.profile.localBindHost
    : '127.0.0.1'
  if (item.profile.connectionKind === 'local-runtime') {
    return `${localHost}:${item.profile.localPort} on this Mac`
  }
  return `${localHost}:${item.profile.localPort} -> ${item.profile.sshTarget}:${item.profile.remoteHost}:${item.profile.remotePort}`
}

export function formatLocalModelTunnelConnectionLabel(
  item: LocalModelTunnelProfileWithStatus,
): string {
  return item.profile.connectionKind === 'local-runtime'
    ? 'This Mac'
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
