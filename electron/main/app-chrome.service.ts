import type { App } from 'electron'
import {
  applyDockIcon as applyDockIconDarwin,
  shouldQuitOnWindowAllClosed as shouldQuitOnWindowAllClosedDarwin,
} from './app-chrome.darwin'
import {
  applyDockIcon as applyDockIconShared,
  shouldQuitOnWindowAllClosed as shouldQuitOnWindowAllClosedShared,
} from './app-chrome.shared'

export function applyDockIcon(
  app: App,
  iconPath: string | null | undefined,
): void {
  if (process.platform === 'darwin') {
    applyDockIconDarwin(app, iconPath)
    return
  }

  applyDockIconShared(app, iconPath)
}

export function shouldQuitOnWindowAllClosed(): boolean {
  if (process.platform === 'darwin') {
    return shouldQuitOnWindowAllClosedDarwin()
  }

  return shouldQuitOnWindowAllClosedShared()
}
