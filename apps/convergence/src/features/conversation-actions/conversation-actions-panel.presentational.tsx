import type { FC } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import {
  ACTIONS_PANEL_GAP,
  ACTIONS_PANEL_WIDTH,
  type ActionsMenuGroup,
} from './conversation-actions-menu.pure'
import { ConversationActionsProject } from './conversation-actions-project.presentational'
import { ConversationActionsRoutines } from './conversation-actions-routines.presentational'
import { ConversationActionsSkills } from './conversation-actions-skills.presentational'
import { conversationActionsStyles as styles } from './conversation-actions.styles'
import type { ConversationActionsViewProps } from './conversation-actions.types'

const GROUP_TITLE: Record<ActionsMenuGroup, string> = {
  skills: 'Skills',
  routines: 'Routines',
  project: 'Project',
}

/**
 * One group's compact list (frames 03, 04, 06–09), placed by the container:
 * 286 wide, growing upward from the button, inside the surface.
 */
export const ConversationActionsPanel: FC<
  ConversationActionsViewProps & { group: ActionsMenuGroup }
> = (props) => {
  const { group, placement, menuRef, onMenuKeyDown, onBack } = props
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={GROUP_TITLE[group]}
      data-testid={`conversation-actions-${group}`}
      className={styles.panel}
      style={
        placement
          ? {
              right: placement.right,
              bottom: placement.bottom,
              width: placement.width,
              maxHeight: placement.maxHeight,
            }
          : {
              right: 0,
              bottom: 34 + ACTIONS_PANEL_GAP,
              width: ACTIONS_PANEL_WIDTH,
            }
      }
      onKeyDown={onMenuKeyDown}
    >
      <div className={styles.panelScroll}>
        <Button
          type="button"
          variant="ghost"
          role="menuitem"
          data-actions-item=""
          aria-label={`Back from ${GROUP_TITLE[group]}`}
          className={styles.back}
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {GROUP_TITLE[group]}
        </Button>
        {group === 'skills' ? <ConversationActionsSkills {...props} /> : null}
        {group === 'routines' ? (
          <ConversationActionsRoutines {...props} />
        ) : null}
        {group === 'project' ? <ConversationActionsProject {...props} /> : null}
      </div>
    </div>
  )
}
