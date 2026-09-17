import {
  TRACKER_LOGICAL_STATUSES,
  type TrackerBinding,
  type TrackerLogicalStatus,
} from './tracker.types'

export const DEFAULT_TRACKER_LABEL_PREFIX = 'horse:'

/** How long a binding field may be (lap 2, F). */
export const TRACKER_BINDING_FIELD_MAX_LENGTH = 128
/** How long a tracker API key may be (lap 2, F). */
export const TRACKER_API_KEY_MAX_LENGTH = 512

/**
 * A value refused for its length, as a typed refusal: the door names the
 * field and the limit, and never echoes the value (it may be a key).
 */
export class TrackerInputTooLongError extends Error {
  constructor(
    readonly field: string,
    readonly limit: number,
  ) {
    super(`${field} must be at most ${limit} characters.`)
    this.name = 'TrackerInputTooLongError'
  }
}

/** Refuses a value longer than `limit`, typed. */
export function requireTrackerInputLength(
  field: string,
  value: string,
  limit: number,
): string {
  if (value.length > limit) throw new TrackerInputTooLongError(field, limit)
  return value
}
export const DEFAULT_TRACKER_WAVE_PREFIX = 'wave:'

/**
 * Linear's defaults, by state name (MAR-3084 R1). `Reviewed` is the one state
 * an admin adds once; a workspace without it simply never reports it.
 */
export const DEFAULT_TRACKER_STATUS_MAP: Readonly<
  Record<string, TrackerLogicalStatus>
> = {
  Backlog: 'backlog',
  Todo: 'todo',
  'In Progress': 'in-progress',
  'In Review': 'in-review',
  Reviewed: 'reviewed',
  Done: 'done',
}

/**
 * The label group a prefix names: `horse:` -> `horse`.
 *
 * This reads the binding's own spelling, never an issue's label: the prefix is
 * how skills WRITE the group (`horse:opus` means the child `opus` of the group
 * `horse`), and the adapter then matches a label by its parent's name.
 */
export function trackerLabelGroupName(prefix: string): string {
  return prefix.trim().replace(/:$/, '').trim()
}

function isLogicalStatus(value: unknown): value is TrackerLogicalStatus {
  return (
    typeof value === 'string' &&
    (TRACKER_LOGICAL_STATUSES as readonly string[]).includes(value)
  )
}

export interface TrackerBindingInput {
  kind?: unknown
  projectId?: unknown
  labelPrefix?: unknown
  wavePrefix?: unknown
  statusMap?: unknown
}

/** The write door for a binding: refuses what it cannot store honestly. */
export function normalizeTrackerBinding(
  input: TrackerBindingInput,
): TrackerBinding {
  if ((input.kind ?? 'linear') !== 'linear') {
    throw new Error(`Unknown tracker kind: ${String(input.kind)}`)
  }
  const projectId =
    typeof input.projectId === 'string' ? input.projectId.trim() : ''
  if (!projectId) throw new Error('A tracker binding needs a project id.')
  requireTrackerInputLength(
    'The project id',
    projectId,
    TRACKER_BINDING_FIELD_MAX_LENGTH,
  )

  const prefix = (value: unknown, fallback: string, what: string) => {
    const text = typeof value === 'string' ? value.trim() : ''
    const chosen = requireTrackerInputLength(
      what,
      text || fallback,
      TRACKER_BINDING_FIELD_MAX_LENGTH,
    )
    if (!trackerLabelGroupName(chosen)) {
      throw new Error(`${what} must name a label group.`)
    }
    return chosen
  }

  let statusMap: Record<string, TrackerLogicalStatus> = {
    ...DEFAULT_TRACKER_STATUS_MAP,
  }
  if (input.statusMap !== undefined && input.statusMap !== null) {
    if (typeof input.statusMap !== 'object' || Array.isArray(input.statusMap)) {
      throw new Error('A status map maps state names to logical statuses.')
    }
    statusMap = {}
    for (const [name, logical] of Object.entries(input.statusMap)) {
      if (!name.trim() || !isLogicalStatus(logical)) {
        throw new Error(
          `A status map entry must name a state and a logical status: ${name}`,
        )
      }
      statusMap[name.trim()] = logical
    }
  }

  return {
    kind: 'linear',
    projectId,
    labelPrefix: prefix(
      input.labelPrefix,
      DEFAULT_TRACKER_LABEL_PREFIX,
      'The label prefix',
    ),
    wavePrefix: prefix(
      input.wavePrefix,
      DEFAULT_TRACKER_WAVE_PREFIX,
      'The wave prefix',
    ),
    statusMap,
  }
}

/** Reads a stored status map; an unreadable one takes the defaults. */
export function readTrackerStatusMap(
  raw: string | null | undefined,
): Record<string, TrackerLogicalStatus> {
  if (!raw) return { ...DEFAULT_TRACKER_STATUS_MAP }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_TRACKER_STATUS_MAP }
    }
    const map: Record<string, TrackerLogicalStatus> = {}
    for (const [name, logical] of Object.entries(parsed)) {
      if (isLogicalStatus(logical)) map[name] = logical
    }
    return map
  } catch {
    return { ...DEFAULT_TRACKER_STATUS_MAP }
  }
}
