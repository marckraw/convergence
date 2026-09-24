import type { LoomNavigationRequest } from '@/entities/loom-navigation'
import type { SessionCrew } from '@/entities/session-crew'
import type { WorkLedgerSnapshot } from '@/entities/work-ledger'
import type { SkillSelection } from '@/entities/skill'
import type { ConversationRoutineAction } from '@/shared/types/electron-api'

export type { ConversationRoutineAction }
export type ConversationAction =
  | ConversationRoutineAction
  | ConversationProjectAction
  | {
      id: string
      kind: 'skill'
      label: string
      offered: boolean
      reason?: string
      skill: SkillSelection
    }

export interface ConversationProjectAction {
  id: 'project:open-issue' | 'project:show-in-loom'
  kind: 'project'
  label: string
  offered: boolean
  reason?: string
  navigation?: LoomNavigationRequest
}

export interface ConversationProjectContext {
  sessionId: string
  crews: readonly SessionCrew[]
  snapshots: Readonly<Record<string, WorkLedgerSnapshot>>
  currentCrewId: string | null
}
