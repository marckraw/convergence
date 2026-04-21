import type { App } from 'electron'

export function applyDockIcon(
  _app: App,
  _iconPath: string | null | undefined,
): void {
  // Non-darwin platforms have no dock to apply an icon to.
}

export function shouldQuitOnWindowAllClosed(): boolean {
  return true
}
