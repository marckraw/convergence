import type { StudioApi } from './studio-api.types'
import type { UpdatesBridge } from '../../../shared/updates.types'

declare global {
  interface Window {
    backpackStudio?: StudioApi
  }
}

export function getUpdatesBridge(): UpdatesBridge | undefined {
  return window.backpackStudio?.updates
}
