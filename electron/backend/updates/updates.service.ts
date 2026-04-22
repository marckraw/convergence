import { INITIAL_UPDATE_STATUS } from './updates.defaults'
import { summarizeError } from './updates.pure'
import type {
  UpdateStatus,
  UpdateTrigger,
  UpdateAvailableStatus,
  UpdateDownloadedStatus,
} from './updates.types'

type AutoUpdaterEvent =
  | 'checking-for-update'
  | 'update-available'
  | 'update-not-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'error'

type AutoUpdaterListener = (...args: unknown[]) => void

export interface AutoUpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  allowDowngrade: boolean
  forceDevUpdateConfig: boolean
  logger: unknown
  on(event: AutoUpdaterEvent, handler: AutoUpdaterListener): void
  off(event: AutoUpdaterEvent, handler: AutoUpdaterListener): void
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export interface UpdatesServiceDeps {
  autoUpdater: AutoUpdaterLike
  appVersion: string
  broadcast: (status: UpdateStatus) => void
  openExternal: (url: string) => Promise<void>
  releaseNotesUrl?: (version: string) => string
  now?: () => Date
}

interface UpdateInfoShape {
  version?: unknown
  releaseNotes?: unknown
  releaseName?: unknown
}

interface DownloadProgressShape {
  percent?: unknown
  bytesPerSecond?: unknown
}

const DEFAULT_RELEASE_NOTES = (version: string): string =>
  `https://github.com/marckraw/convergence/releases/tag/v${version}`

export class UpdatesService {
  private status: UpdateStatus = INITIAL_UPDATE_STATUS
  private lastTrigger: UpdateTrigger | null = null
  private lastAvailable: UpdateAvailableStatus | UpdateDownloadedStatus | null =
    null
  private readonly listeners: Array<
    readonly [AutoUpdaterEvent, AutoUpdaterListener]
  > = []
  private disposed = false

  constructor(private readonly deps: UpdatesServiceDeps) {
    this.configureAutoUpdater()
    this.subscribe()
  }

  private configureAutoUpdater(): void {
    const u = this.deps.autoUpdater
    u.autoDownload = false
    u.autoInstallOnAppQuit = false
    u.allowPrerelease = false
    u.allowDowngrade = false
    u.forceDevUpdateConfig = false
    u.logger = null
  }

  private subscribe(): void {
    this.bind('checking-for-update', () => {
      // status was already set to 'checking' by check() — nothing to do.
    })
    this.bind('update-available', (info) => {
      const shape = toShape<UpdateInfoShape>(info)
      const version =
        typeof shape.version === 'string' ? shape.version : 'unknown'
      const next: UpdateAvailableStatus = {
        phase: 'available',
        version,
        releaseNotesUrl: this.buildReleaseNotesUrl(version),
        detectedAt: this.isoNow(),
      }
      this.lastAvailable = next
      this.setStatus(next)
    })
    this.bind('update-not-available', () => {
      this.setStatus({
        phase: 'not-available',
        currentVersion: this.deps.appVersion,
        lastChecked: this.isoNow(),
      })
    })
    this.bind('download-progress', (raw) => {
      const shape = toShape<DownloadProgressShape>(raw)
      const percent = toNumber(shape.percent, 0)
      const bytesPerSecond = toNumber(shape.bytesPerSecond, 0)
      const version = this.lastAvailable?.version ?? 'unknown'
      this.setStatus({
        phase: 'downloading',
        version,
        percent,
        bytesPerSecond,
      })
    })
    this.bind('update-downloaded', (info) => {
      const shape = toShape<UpdateInfoShape>(info)
      const version =
        typeof shape.version === 'string'
          ? shape.version
          : (this.lastAvailable?.version ?? 'unknown')
      const next: UpdateDownloadedStatus = {
        phase: 'downloaded',
        version,
        releaseNotesUrl: this.buildReleaseNotesUrl(version),
      }
      this.lastAvailable = next
      this.setStatus(next)
    })
    this.bind('error', (raw) => {
      this.setStatus({
        phase: 'error',
        message: summarizeError(raw),
        lastChecked: this.isoNow(),
      })
    })
  }

  private bind(event: AutoUpdaterEvent, handler: AutoUpdaterListener): void {
    this.deps.autoUpdater.on(event, handler)
    this.listeners.push([event, handler])
  }

  check(trigger: UpdateTrigger): UpdateStatus {
    if (this.disposed) return this.status
    if (
      this.status.phase === 'checking' ||
      this.status.phase === 'downloading' ||
      this.status.phase === 'downloaded'
    ) {
      return this.status
    }
    this.lastTrigger = trigger
    this.setStatus({ phase: 'checking', startedAt: this.isoNow() })
    void this.deps.autoUpdater.checkForUpdates().catch((err: unknown) => {
      this.setStatus({
        phase: 'error',
        message: summarizeError(err),
        lastChecked: this.isoNow(),
      })
    })
    return this.status
  }

  download(): UpdateStatus {
    if (this.disposed) return this.status
    if (this.status.phase !== 'available') {
      this.setStatus({
        phase: 'error',
        message: 'No update available to download.',
        lastChecked: this.isoNow(),
      })
      return this.status
    }
    void this.deps.autoUpdater.downloadUpdate().catch((err: unknown) => {
      this.setStatus({
        phase: 'error',
        message: summarizeError(err),
        lastChecked: this.isoNow(),
      })
    })
    return this.status
  }

  install(): UpdateStatus {
    if (this.disposed) return this.status
    if (this.status.phase !== 'downloaded') {
      this.setStatus({
        phase: 'error',
        message: 'No update downloaded yet.',
        lastChecked: this.isoNow(),
      })
      return this.status
    }
    this.deps.autoUpdater.quitAndInstall(false, true)
    return this.status
  }

  async openReleaseNotes(): Promise<boolean> {
    const url = this.pickReleaseNotesUrl()
    if (!url) return false
    await this.deps.openExternal(url)
    return true
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  getLastTrigger(): UpdateTrigger | null {
    return this.lastTrigger
  }

  getAppVersion(): string {
    return this.deps.appVersion
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const [event, handler] of this.listeners) {
      this.deps.autoUpdater.off(event, handler)
    }
    this.listeners.length = 0
  }

  private setStatus(next: UpdateStatus): void {
    this.status = next
    this.deps.broadcast(next)
  }

  private pickReleaseNotesUrl(): string | null {
    if (this.status.phase === 'available') return this.status.releaseNotesUrl
    if (this.status.phase === 'downloaded') return this.status.releaseNotesUrl
    if (this.lastAvailable) return this.lastAvailable.releaseNotesUrl
    return null
  }

  private buildReleaseNotesUrl(version: string): string {
    const build = this.deps.releaseNotesUrl ?? DEFAULT_RELEASE_NOTES
    return build(version)
  }

  private isoNow(): string {
    const now = this.deps.now ? this.deps.now() : new Date()
    return now.toISOString()
  }
}

function toShape<T>(value: unknown): Partial<T> {
  if (value && typeof value === 'object') return value as Partial<T>
  return {}
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
