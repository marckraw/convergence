import type { FC } from 'react'
import { ListRow } from '@convergence/ui'
import { conversationActionsStyles as styles } from './conversation-actions.styles'
import type { ActionRowView } from './conversation-actions.types'

/**
 * One row of a compact list: a dense ListRow on a button (R3: a row, not a
 * Button resized into one). A row that is not offered stays focusable and
 * readable (aria-disabled, not disabled) with its reason under it, and
 * activating it does nothing. A menu's row says so (`menuitem`); a row in a
 * panel that isn't a menu (the Skills list's way to Routines) doesn't.
 */
export const ConversationActionItem: FC<{
  row: ActionRowView
  onActivate: (id: string) => void
  menu?: boolean
}> = ({ row, onActivate, menu = true }) => (
  <>
    <ListRow
      density="dense"
      render={<button type="button" />}
      title={row.label}
      role={menu ? 'menuitem' : undefined}
      data-actions-item=""
      aria-disabled={!row.offered || undefined}
      className={styles.item}
      onClick={() => {
        if (row.offered) onActivate(row.id)
      }}
    />
    {row.reason ? <p className={styles.reason}>{row.reason}</p> : null}
  </>
)
