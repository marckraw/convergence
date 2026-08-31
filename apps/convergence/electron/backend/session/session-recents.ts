import type { StateService } from '../state/state.service'

const RECENT_SESSION_IDS_KEY = 'recent_session_ids'

export function getRecentSessionIds(state: StateService): string[] {
  const raw = state.get(RECENT_SESSION_IDS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === 'string')
  } catch {
    return []
  }
}

export function setRecentSessionIds(state: StateService, ids: string[]): void {
  state.set(RECENT_SESSION_IDS_KEY, JSON.stringify(ids))
}
