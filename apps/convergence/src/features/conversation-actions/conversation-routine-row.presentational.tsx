import type { FC } from 'react'
import { Button } from '@/shared/ui/button'
import { ConversationActionItem } from './conversation-action-item.presentational'
import type { RoutineRowView } from './conversation-actions-menu.pure'
import { conversationActionsStyles as styles } from './conversation-actions.styles'

/**
 * One routine: its row, and while it runs, its beat and the Cancel state the
 * shared drill resolver decided (frames 06 and 07). Nothing here decides
 * whether Cancel is real.
 */
export const ConversationRoutineRow: FC<{
  row: RoutineRowView
  compactError: string | null
  cancelRefusal: string | null
  onRoutine: (id: RoutineRowView['id']) => void
  onCancelDrill: () => void
}> = ({ row, compactError, cancelRefusal, onRoutine, onCancelDrill }) => {
  const { progress } = row
  const cancel = progress?.cancel ?? null
  return (
    <div data-testid={`routine-${row.id}`}>
      <ConversationActionItem
        row={{
          id: row.id,
          label: row.label,
          offered: row.offered,
          reason: row.reason,
        }}
        onActivate={() => onRoutine(row.id)}
      />
      {progress ? (
        <p className={styles.progress} role="status">
          {progress.label}
        </p>
      ) : null}
      {cancel ? (
        <>
          <Button
            type="button"
            variant="ghost"
            role="menuitem"
            data-actions-item=""
            aria-disabled={!cancel.enabled || undefined}
            className={styles.item}
            onClick={() => {
              if (cancel.enabled) onCancelDrill()
            }}
          >
            {cancel.enabled ? 'Cancel' : 'Cancel unavailable'}
          </Button>
          <p className={styles.reason}>
            {cancel.enabled
              ? 'Cancels the routine; the current reply may continue.'
              : cancel.reason}
          </p>
        </>
      ) : null}
      {cancelRefusal ? (
        <p className={styles.refusal} role="alert">
          {cancelRefusal}
        </p>
      ) : null}
      {compactError ? (
        <p className={styles.refusal} role="alert">
          {compactError}
        </p>
      ) : null}
    </div>
  )
}
