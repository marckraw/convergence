export type UpdateState = {
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'error'
  version?: string
}

export interface UpdatesBridge {
  getState(): Promise<UpdateState>
  check(): Promise<void>
  download(): Promise<void>
  install(): Promise<void>
  subscribe(listener: (state: UpdateState) => void): () => void
}

export const updateChannels = {
  state: 'studio:updates:state',
  get: 'studio:updates:get',
  check: 'studio:updates:check',
  download: 'studio:updates:download',
  install: 'studio:updates:install',
} as const
