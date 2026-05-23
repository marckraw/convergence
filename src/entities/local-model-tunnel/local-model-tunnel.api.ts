import type {
  LocalModelTunnelProfileInput,
  LocalModelTunnelSnapshot,
} from './local-model-tunnel.types'

function emptySnapshot(): LocalModelTunnelSnapshot {
  return { profiles: [], updatedAt: new Date().toISOString() }
}

function getApi() {
  return window.electronAPI?.localModelTunnel
}

export const localModelTunnelApi = {
  getSnapshot: (): Promise<LocalModelTunnelSnapshot> =>
    getApi()?.getSnapshot() ?? Promise.resolve(emptySnapshot()),
  start: (profileId: string): Promise<LocalModelTunnelSnapshot> =>
    getApi()?.start(profileId) ?? Promise.resolve(emptySnapshot()),
  stop: (profileId: string): Promise<LocalModelTunnelSnapshot> =>
    getApi()?.stop(profileId) ?? Promise.resolve(emptySnapshot()),
  restart: (profileId: string): Promise<LocalModelTunnelSnapshot> =>
    getApi()?.restart(profileId) ?? Promise.resolve(emptySnapshot()),
  createProfile: (
    input: LocalModelTunnelProfileInput,
  ): Promise<LocalModelTunnelSnapshot> =>
    getApi()?.createProfile(input) ?? Promise.resolve(emptySnapshot()),
  updateProfile: (
    profileId: string,
    input: LocalModelTunnelProfileInput,
  ): Promise<LocalModelTunnelSnapshot> =>
    getApi()?.updateProfile(profileId, input) ??
    Promise.resolve(emptySnapshot()),
  deleteProfile: (profileId: string): Promise<LocalModelTunnelSnapshot> =>
    getApi()?.deleteProfile(profileId) ?? Promise.resolve(emptySnapshot()),
  onChanged: (
    callback: (snapshot: LocalModelTunnelSnapshot) => void,
  ): (() => void) => getApi()?.onChanged(callback) ?? (() => undefined),
}
