import type { CrewConfigSession, CrewConfigProject } from './crew-config.types'
import type { SessionCrew } from './crew.types'
import type { SessionRelay } from '../relay/relay.types'
export interface CrewImportWorld {
  sessions: (CrewConfigSession & {
    contextKind: 'project' | 'global'
    archivedAt: string | null
    lastActivity: string | null
  })[]
  projects: CrewConfigProject[]
  endpointIds: string[]
  crews: SessionCrew[]
  relays: SessionRelay[]
}
export type {
  CrewImportPlan,
  CrewImportDecisions,
  CrewImportReport,
} from '../../../src/shared/types/crew-import.types'
