import type { KeyboardEvent, RefObject } from 'react'
import type {
  ActionsMenuGroup,
  ActionsMenuLevel,
  ActionsPanelPlacement,
  RoutineRowView,
  SkillListState,
} from './conversation-actions-menu.pure'

export interface ActionRowView {
  id: string
  label: string
  offered: boolean
  reason: string | null
}

export interface ConversationActionsViewProps {
  level: ActionsMenuLevel
  fanGroups: ReadonlyArray<{ id: ActionsMenuGroup; label: string }>
  placement: ActionsPanelPlacement | null
  skills: {
    state: SkillListState
    rows: readonly ActionRowView[]
    notice: string | null
    query: string
  }
  routines: {
    loaded: boolean
    error: string | null
    rows: readonly RoutineRowView[]
    cancelRefusal: string | null
    compactError: string | null
    running: boolean
  }
  projectRows: readonly ActionRowView[]
  triggerRef: RefObject<HTMLButtonElement | null>
  menuRef: RefObject<HTMLDivElement | null>
  searchRef: RefObject<HTMLInputElement | null>
  anchorRef: RefObject<HTMLDivElement | null>
  onToggle: () => void
  onClose: () => void
  onBack: () => void
  onOpenGroup: (group: ActionsMenuGroup) => void
  onMenuKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onQueryChange: (query: string) => void
  onSkill: (id: string) => void
  onRoutine: (id: RoutineRowView['id']) => void
  onCancelDrill: () => void
  onProject: (id: string) => void
}
