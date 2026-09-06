import {
  SESSION_CARD_ORDER_PRESETS,
  type SessionCardOrderPreset,
} from './session-card-order.pure'
import {
  SESSION_CARD_STATES,
  type SessionCardState,
} from './session-card-state.pure'

export const MISSION_CONTROL_VIEW_MODES = ['flat', 'canvas'] as const

/**
 * Flat lays every card in one grid; Canvas draws the crews as wired diagrams
 * you can author. Two ways of reading one room.
 *
 * `crews` was the third, and it retired with R13 (RUN45): every capability it
 * had — membership, wire authoring, baton names, limits, history and the
 * chair — now has a home on the Canvas, and a separate list of the same crews
 * was a second place to keep in step. A stored `crews` reads as `canvas`
 * rather than falling back to the default, because that is what the person
 * who chose it was actually looking at.
 */
export type MissionControlViewMode = (typeof MISSION_CONTROL_VIEW_MODES)[number]

/**
 * What a stored mode from an older build means now.
 *
 * Its own function rather than a branch inside the parser, so the rule has one
 * home and the retired words are listed where they can be read.
 */
export function readStoredViewMode(value: unknown): MissionControlViewMode {
  if (MISSION_CONTROL_VIEW_MODES.includes(value as MissionControlViewMode)) {
    return value as MissionControlViewMode
  }
  // The retired Crews view. Landing on `flat` would take somebody who was
  // looking at their wires to a grid with no wires in it.
  if (value === 'crews') return 'canvas'
  return DEFAULT_MISSION_CONTROL_VIEW.mode
}

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
  const mode = readStoredViewMode(record.mode)
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
