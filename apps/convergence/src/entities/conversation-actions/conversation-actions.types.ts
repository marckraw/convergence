import type { SkillSelection } from '@/entities/skill'
import type { ConversationRoutineAction } from '@/shared/types/electron-api'

export type { ConversationRoutineAction }
export type ConversationAction =
  | ConversationRoutineAction
  | {
      id: string
      kind: 'skill'
      label: string
      offered: boolean
      reason?: string
      skill: SkillSelection
    }
