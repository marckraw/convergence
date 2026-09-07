import type { UpdatesBridge } from '../../../shared/updates.types'

declare global {
  interface Window {
    backpackStudio?: { platform: string; updates: UpdatesBridge }
  }
}

export function getUpdatesBridge(): UpdatesBridge | undefined {
  return window.backpackStudio?.updates
}
