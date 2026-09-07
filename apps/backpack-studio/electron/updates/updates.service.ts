import type { UpdateState } from '../../shared/updates.types'

interface UpdateDriver {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on(event: string, listener: (...args: unknown[]) => void): unknown
  off(event: string, listener: (...args: unknown[]) => void): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void
}

/** Adapter: keeps Studio's UI and lifecycle independent of electron-updater's events. */
export function createStudioUpdater(
  driver: UpdateDriver,
  publish: (state: UpdateState) => void,
) {
  let state: UpdateState = { status: 'idle' }
  let disposed = false
  driver.autoDownload = false
  driver.autoInstallOnAppQuit = false
  const setState = (next: UpdateState) => {
    if (disposed) return
    state = next
    publish(state)
  }
  const version = (info: unknown) => (info as { version: string }).version
  const listeners: Record<string, (...args: unknown[]) => void> = {
    'checking-for-update': () => setState({ status: 'checking' }),
    'update-not-available': () => setState({ status: 'idle' }),
    'update-available': (info) =>
      setState({ status: 'available', version: version(info) }),
    'update-downloaded': (info) =>
      setState({ status: 'downloaded', version: version(info) }),
    error: () => setState({ status: 'error' }),
  }
  for (const [event, listener] of Object.entries(listeners))
    driver.on(event, listener)
  async function check() {
    if (
      disposed ||
      ['checking', 'downloading', 'downloaded'].includes(state.status)
    )
      return
    setState({ status: 'checking' })
    try {
      await driver.checkForUpdates()
    } catch {
      setState({ status: 'error' })
    }
  }
  const launch = setTimeout(() => {
    void check()
  }, 10_000)
  const periodic = setInterval(
    () => {
      void check()
    },
    4 * 60 * 60 * 1000,
  )
  return {
    getState: () => state,
    check,
    async download() {
      if (disposed || state.status !== 'available') return
      setState({ ...state, status: 'downloading' })
      try {
        await driver.downloadUpdate()
      } catch {
        setState({ status: 'error' })
      }
    },
    install() {
      if (!disposed && state.status === 'downloaded')
        driver.quitAndInstall(false, true)
    },
    dispose() {
      disposed = true
      clearTimeout(launch)
      clearInterval(periodic)
      for (const [event, listener] of Object.entries(listeners))
        driver.off(event, listener)
    },
  }
}
