import {
  SESSION_CARD_ORDER_PRESETS,
  type SessionCardOrderPreset,
} from './session-card-order.pure'
import {
  SESSION_CARD_STATES,
  type SessionCardState,
} from './session-card-state.pure'

/**
 * The shape of the room Marcin left behind: how it was ordered and what it was
 * narrowed to.
 *
 * The search query is deliberately absent. A search is a gesture he makes and
 * finishes; the states and pickers are the shape he works in, and only a shape
 * is worth restoring.
 */
export interface StoredMissionControlView {
  order: SessionCardOrderPreset
  states: SessionCardState[]
  projectIds: string[]
  providerIds: string[]
}

export const DEFAULT_MISSION_CONTROL_VIEW: StoredMissionControlView = {
  order: 'attention-first',
  states: [],
  projectIds: [],
  providerIds: [],
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

/**
 * Reads a stored view back, tolerating anything. Storage outlives code: a
 * preset we have since renamed, a half-written value, a hand-edited string —
 * each falls back to the default rather than breaking the room.
 */
export function parseMissionControlView(
  raw: string | null,
): StoredMissionControlView {
  if (!raw) return DEFAULT_MISSION_CONTROL_VIEW

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DEFAULT_MISSION_CONTROL_VIEW
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return DEFAULT_MISSION_CONTROL_VIEW
  }

  const record = parsed as Record<string, unknown>
  const order = SESSION_CARD_ORDER_PRESETS.includes(
    record.order as SessionCardOrderPreset,
  )
    ? (record.order as SessionCardOrderPreset)
    : DEFAULT_MISSION_CONTROL_VIEW.order

  const storedStates = readStringArray(record.states)
  const states = SESSION_CARD_STATES.filter((state) =>
    storedStates.includes(state),
  )

  return {
    order,
    states,
    projectIds: readStringArray(record.projectIds),
    providerIds: readStringArray(record.providerIds),
  }
}

export function serializeMissionControlView(
  view: StoredMissionControlView,
): string {
  return JSON.stringify(view)
}
