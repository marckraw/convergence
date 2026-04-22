import type { UpdatePrefs, UpdateIdleStatus } from './updates.types'

export const DEFAULT_UPDATE_PREFS: UpdatePrefs = {
  backgroundCheckEnabled: true,
}

export const INITIAL_UPDATE_STATUS: UpdateIdleStatus = {
  phase: 'idle',
  lastChecked: null,
  lastError: null,
}
