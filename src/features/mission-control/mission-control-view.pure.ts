import {
  SESSION_CARD_ORDER_PRESETS,
  type SessionCardOrderPreset,
} from './session-card-order.pure'
import {
  SESSION_CARD_STATES,
  type SessionCardState,
} from './session-card-state.pure'

export const MISSION_CONTROL_VIEW_MODES = ['flat', 'crews', 'canvas'] as const

/**
 * Flat lays every card in one grid; crews groups them into their containers;
 * canvas draws the crews as wired diagrams. All three are the same room read
 * three ways -- the canvas is a view, not a workspace, and cannot be authored.
 */
export type MissionControlViewMode = (typeof MISSION_CONTROL_VIEW_MODES)[number]

/**
 * The shape of the room Marcin left behind: which layout he chose, how it was
 * ordered and what it was narrowed to.
 *
 * The search query is deliberately absent. A search is a gesture he makes and
 * finishes; the states and pickers are the shape he works in, and only a shape
 * is worth restoring.
 *
 * Only the VIEW CHOICE lives here. Crews themselves are data and live in
 * sqlite — this store is view preference and nothing else.
 */
export interface StoredMissionControlView {
  mode: MissionControlViewMode
  order: SessionCardOrderPreset
  states: SessionCardState[]
  projectIds: string[]
  providerIds: string[]
  crewIds: string[]
}

export const DEFAULT_MISSION_CONTROL_VIEW: StoredMissionControlView = {
  mode: 'flat',
  order: 'attention-first',
  states: [],
  projectIds: [],
  providerIds: [],
  crewIds: [],
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
  const mode = MISSION_CONTROL_VIEW_MODES.includes(
    record.mode as MissionControlViewMode,
  )
    ? (record.mode as MissionControlViewMode)
    : DEFAULT_MISSION_CONTROL_VIEW.mode
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
    mode,
    order,
    states,
    projectIds: readStringArray(record.projectIds),
    providerIds: readStringArray(record.providerIds),
    crewIds: readStringArray(record.crewIds),
  }
}

export function serializeMissionControlView(
  view: StoredMissionControlView,
): string {
  return JSON.stringify(view)
}
