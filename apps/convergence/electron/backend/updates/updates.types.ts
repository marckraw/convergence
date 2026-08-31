export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error'

export type UpdateTrigger = 'user' | 'background'

export interface UpdateIdleStatus {
  phase: 'idle'
  lastChecked: string | null
  lastError: string | null
}

export interface UpdateCheckingStatus {
  phase: 'checking'
  startedAt: string
}

export interface UpdateAvailableStatus {
  phase: 'available'
  version: string
  releaseNotesUrl: string
  detectedAt: string
}

export interface UpdateDownloadingStatus {
  phase: 'downloading'
  version: string
  percent: number
  bytesPerSecond: number
}

export interface UpdateDownloadedStatus {
  phase: 'downloaded'
  version: string
  releaseNotesUrl: string
}

export interface UpdateNotAvailableStatus {
  phase: 'not-available'
  currentVersion: string
  lastChecked: string
}

export interface UpdateErrorStatus {
  phase: 'error'
  message: string
  lastChecked: string | null
}

export type UpdateStatus =
  | UpdateIdleStatus
  | UpdateCheckingStatus
  | UpdateAvailableStatus
  | UpdateDownloadingStatus
  | UpdateDownloadedStatus
  | UpdateNotAvailableStatus
  | UpdateErrorStatus

export interface UpdatePrefs {
  backgroundCheckEnabled: boolean
}

export interface UpdateProgressInput {
  percent: number
  bytesPerSecond: number
}

export interface FormattedUpdateProgress {
  percent: number
  humanSpeed: string
}
