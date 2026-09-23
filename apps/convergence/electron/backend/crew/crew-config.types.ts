import type { RelaySpawnSpec } from '../relay/relay.types'
import type { SessionPermissionConfig } from '../provider/provider.types'
import type {
  SessionCrew,
  SessionCrewMemberKind,
  SessionCrewMemberLane,
  SessionCrewMemberRole,
} from './crew.types'
import type { SessionSummary } from '../session/session.types'
import type { Project } from '../project/project.types'
import type {
  TrackerBinding,
  TrackerLogicalStatus,
  TrackerProjectResolution,
} from '../tracker/tracker.types'

export type CrewConfigSession = Pick<
  SessionSummary,
  | 'id'
  | 'name'
  | 'providerId'
  | 'model'
  | 'effort'
  | 'permissionConfig'
  | 'projectId'
  | 'executionHost'
>
/** Origins are read locally by the IO boundary, never by the serializer. */
export type CrewConfigProject = Pick<
  Project,
  'id' | 'name' | 'laneOf' | 'laneName'
> & { origin: string | null }
export type CrewConfigCrew = Pick<
  SessionCrew,
  'name' | 'emoji' | 'accentColor' | 'roundCap' | 'stallMinutes'
> & {
  /** Absent or null: the crew is not bound, and the file carries no block. */
  trackerBinding?: TrackerBinding | null
}
export interface CrewConfigRole {
  conversation: string
  /**
   * The seat this conversation holds (MAR-3083 R5). Optional so a recipe
   * written before seats existed still reads, and imports at the defaults
   * (`horse · resident · 1`). `host` above is the seat's host: for a resident
   * seat the conversation's own execution host IS where that seat works.
   */
  role?: SessionCrewMemberRole
  kind?: SessionCrewMemberKind
  roleCard?: string
  lanePolicy?: SessionCrewMemberLane
  wipLimit?: number
  provider: string
  model: string | null
  effort: string | null
  permissions: 'ask' | 'yolo' | SessionPermissionConfig
  project: string | null
  lane?: string
  host: string
}
export interface CrewConfigSpawn {
  name: string
  /**
   * The crew seat this wire spawns, by baton name (MAR-3083 R3). Present only
   * when the wire names one; the seat supplies provider, model, host and card
   * at firing time.
   */
  member?: string
  provider: string
  model: string | null
  effort: string | null
  project: string | null
  lane?: string
  account: 'default'
  host?: string
  workAddress?: RelaySpawnSpec['workAddress']
  roleCard?: RelaySpawnSpec['roleCard']
  returnWire?: RelaySpawnSpec['returnWire']
}
export interface CrewConfigWire {
  from: string
  to: string | { spawn: CrewConfigSpawn }
  when: string
  opener: 'keep' | 'clear' | { first: string }
  instruction?: string
  armed?: false
}
/**
 * The crew's tracker binding as the file carries it (MAR-3211, ruling A).
 *
 * `project` is the tracker's project ID -- the binding itself, because the
 * watcher trusts a binding only when the tracker answers with the stored id.
 * `projectName` is for the person reading the file and the import plan: it is
 * shown, never bound, and written only when the crew's key could look it up.
 * The key is never here: it is a person's act on each machine.
 */
export interface CrewConfigTracker {
  kind: 'linear'
  project: string
  projectName?: string
  labelPrefix?: string
  wavePrefix?: string
  statusMap?: Record<string, TrackerLogicalStatus>
  autoDispatch?: boolean
}
/**
 * Looks a tracker project up by id with the crew's own key (MAR-3211). Null
 * when the crew has no key: nothing was asked, which is not the same as the
 * tracker saying no.
 */
export type CrewTrackerLookup = (
  crewId: string,
  projectId: string,
) => Promise<TrackerProjectResolution | null>
export interface CrewConfig {
  version: 1
  crew: string
  emoji: string | null
  color?: string
  limits: { deliveriesPerRun: number; attentionAfterMinutes: number }
  tracker?: CrewConfigTracker
  roles: Record<string, CrewConfigRole>
  wires: CrewConfigWire[]
  layout?: Record<string, [number, number]>
}
