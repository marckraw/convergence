import type { SessionPermissionConfig } from '../provider/provider.types'
import type { SessionCrew } from './crew.types'
import type { SessionSummary } from '../session/session.types'
import type { Project } from '../project/project.types'

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
>
export interface CrewConfigRole {
  conversation: string
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
  provider: string
  model: string | null
  effort: string | null
  project: string | null
  lane?: string
  account: 'default'
}
export interface CrewConfigWire {
  from: string
  to: string | { spawn: CrewConfigSpawn }
  when: string
  opener: 'keep' | 'clear' | { first: string }
  instruction?: string
  armed?: false
}
export interface CrewConfig {
  version: 1
  crew: string
  emoji: string | null
  color?: string
  limits: { deliveriesPerRun: number; attentionAfterMinutes: number }
  roles: Record<string, CrewConfigRole>
  wires: CrewConfigWire[]
  layout?: Record<string, [number, number]>
}
