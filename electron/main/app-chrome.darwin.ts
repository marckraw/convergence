import type { App } from 'electron'

export function applyDockIcon(
  app: App,
  iconPath: string | null | undefined,
): void {
  if (!iconPath) return
  app.dock?.setIcon(iconPath)
}

export function shouldQuitOnWindowAllClosed(): boolean {
  return false
}
