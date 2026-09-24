import type { FC } from 'react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { ConversationRoutineRow } from './conversation-routine-row.presentational'
import { conversationActionsStyles as styles } from './conversation-actions.styles'
import type { ConversationActionsViewProps } from './conversation-actions.types'

/** The Routines list (frames 04, 06 and 07). */
export const ConversationActionsRoutines: FC<ConversationActionsViewProps> = ({
  routines,
  onRoutine,
  onCancelDrill,
  onClose,
}) => (
  <>
    {!routines.loaded && routines.rows.length === 0 ? (
      <p className={styles.status} role="status">
        Reading this conversation…
      </p>
    ) : null}
    {routines.error ? (
      <p className={styles.refusal} role="alert">
        {routines.error}
      </p>
    ) : null}
    <div className={styles.list}>
      {routines.rows.map((row) => (
        <ConversationRoutineRow
          key={row.id}
          row={row}
          compactError={row.id === 'compact' ? routines.compactError : null}
          cancelRefusal={row.id === 'drill' ? routines.cancelRefusal : null}
          onRoutine={onRoutine}
          onCancelDrill={onCancelDrill}
        />
      ))}
    </div>
    {routines.running ? (
      <Button
        type="button"
        variant="ghost"
        role="menuitem"
        data-actions-item=""
        className={cn(styles.item, 'mt-1 text-xs text-muted-foreground')}
        onClick={onClose}
      >
        Close menu
      </Button>
    ) : (
      <p className={styles.hint}>Esc closes</p>
    )}
  </>
)
