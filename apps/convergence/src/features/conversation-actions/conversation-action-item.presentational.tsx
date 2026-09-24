import type { FC } from 'react'
import { Button } from '@/shared/ui/button'
import { conversationActionsStyles as styles } from './conversation-actions.styles'
import type { ActionRowView } from './conversation-actions.types'

/**
 * One row of a compact list. A row that is not offered stays focusable and
 * readable (aria-disabled, not disabled) with its reason under it, and
 * activating it does nothing.
 */
export const ConversationActionItem: FC<{
  row: ActionRowView
  onActivate: (id: string) => void
}> = ({ row, onActivate }) => (
  <>
    <Button
      type="button"
      variant="ghost"
      role="menuitem"
      data-actions-item=""
      aria-disabled={!row.offered || undefined}
      className={styles.item}
      onClick={() => {
        if (row.offered) onActivate(row.id)
      }}
    >
      {row.label}
    </Button>
    {row.reason ? <p className={styles.reason}>{row.reason}</p> : null}
  </>
)
