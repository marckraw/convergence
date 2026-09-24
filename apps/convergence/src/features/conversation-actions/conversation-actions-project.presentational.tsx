import type { FC } from 'react'
import { ConversationActionItem } from './conversation-action-item.presentational'
import { conversationActionsStyles as styles } from './conversation-actions.styles'
import type { ConversationActionsViewProps } from './conversation-actions.types'

/** The Project list (frame 09): CA3's navigation actions for this seat. */
export const ConversationActionsProject: FC<ConversationActionsViewProps> = ({
  projectRows,
  onProject,
}) => (
  <>
    <div className={styles.list}>
      {projectRows.map((row) => (
        <ConversationActionItem key={row.id} row={row} onActivate={onProject} />
      ))}
    </div>
    <p className={styles.hint}>{"Current conversation's seat"}</p>
    <p className={styles.hint}>Esc closes</p>
  </>
)
