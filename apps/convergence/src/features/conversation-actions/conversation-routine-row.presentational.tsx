import type { FC } from 'react'
import { FormError } from '@convergence/ui'
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
        <ConversationActionItem
          row={{
            id: 'cancel',
            label: cancel.enabled ? 'Cancel' : 'Cancel unavailable',
            offered: cancel.enabled,
            reason: cancel.enabled
              ? 'Cancels the routine; the current reply may continue.'
              : cancel.reason,
          }}
          onActivate={onCancelDrill}
        />
      ) : null}
      {cancelRefusal ? (
        <FormError className={styles.refusal}>{cancelRefusal}</FormError>
      ) : null}
      {compactError ? (
        <FormError className={styles.refusal}>{compactError}</FormError>
      ) : null}
    </div>
  )
}
