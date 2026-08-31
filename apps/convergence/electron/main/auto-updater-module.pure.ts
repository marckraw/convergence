import type { AutoUpdaterLike } from '../backend/updates/updates.service'

interface AutoUpdaterModuleShape {
  autoUpdater?: unknown
  default?: {
    autoUpdater?: unknown
  }
}

export function resolveAutoUpdater(module: unknown): AutoUpdaterLike | null {
  const shape = toModuleShape(module)
  const candidates = [shape.autoUpdater, shape.default?.autoUpdater, module]
  for (const candidate of candidates) {
    if (isAutoUpdaterLike(candidate)) return candidate
  }
  return null
}

function toModuleShape(value: unknown): AutoUpdaterModuleShape {
  if (value && typeof value === 'object') return value as AutoUpdaterModuleShape
  return {}
}

function isAutoUpdaterLike(value: unknown): value is AutoUpdaterLike {
  if (!value || typeof value !== 'object') return false
  const shape = value as Partial<Record<keyof AutoUpdaterLike, unknown>>
  return (
    typeof shape.on === 'function' &&
    typeof shape.off === 'function' &&
    typeof shape.checkForUpdates === 'function' &&
    typeof shape.downloadUpdate === 'function' &&
    typeof shape.quitAndInstall === 'function'
  )
}
