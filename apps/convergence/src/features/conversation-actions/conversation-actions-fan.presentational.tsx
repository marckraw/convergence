import type { FC } from 'react'
import { ArrowUpRight, RotateCw, Slash, X, type LucideIcon } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import type { ActionsMenuGroup } from './conversation-actions-menu.pure'
import {
  conversationActionsStyles as styles,
  FAN_ITEM_POSITION,
} from './conversation-actions.styles'
import type { ConversationActionsViewProps } from './conversation-actions.types'

const GROUP_ICON: Record<ActionsMenuGroup, LucideIcon> = {
  skills: Slash,
  routines: RotateCw,
  project: ArrowUpRight,
}

/** The light fan (frame 02): Skills / Routines / Project, and Close. */
export const ConversationActionsFan: FC<ConversationActionsViewProps> = ({
  fanGroups,
  menuRef,
  onOpenGroup,
  onClose,
  onMenuKeyDown,
}) => (
  <div
    ref={menuRef}
    role="menu"
    aria-label="Actions"
    className={styles.fan}
    onKeyDown={onMenuKeyDown}
  >
    {fanGroups.map((entry) => {
      const Icon = GROUP_ICON[entry.id]
      return (
        <Button
          key={entry.id}
          type="button"
          variant="ghost"
          role="menuitem"
          data-actions-item=""
          className={styles.fanItem}
          style={FAN_ITEM_POSITION[entry.id]}
          onClick={() => onOpenGroup(entry.id)}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {entry.label}
        </Button>
      )
    })}
    <Button
      type="button"
      variant="ghost"
      role="menuitem"
      data-actions-item=""
      aria-label="Close menu"
      className={styles.fanClose}
      onClick={onClose}
    >
      <X className="h-3.5 w-3.5" aria-hidden="true" />
      Close
    </Button>
  </div>
)
