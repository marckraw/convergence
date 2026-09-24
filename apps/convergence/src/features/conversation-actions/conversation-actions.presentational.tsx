import type { FC } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { ConversationActionsFan } from './conversation-actions-fan.presentational'
import { ConversationActionsPanel } from './conversation-actions-panel.presentational'
import { conversationActionsStyles as styles } from './conversation-actions.styles'
import type { ConversationActionsViewProps } from './conversation-actions.types'

/** Render-only: the Actions button, its fan and one group's compact list. */
export const ConversationActionsView: FC<ConversationActionsViewProps> = (
  props,
) => {
  const { level, triggerRef, anchorRef, onToggle } = props
  const fanOpen = level === 'fan'
  const group = level === 'closed' || level === 'fan' ? null : level

  return (
    <div className={styles.row} data-testid="conversation-actions">
      <div ref={anchorRef} className={styles.anchor}>
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          className={cn(styles.trigger, fanOpen && styles.triggerHidden)}
          aria-haspopup="menu"
          aria-expanded={level !== 'closed'}
          aria-hidden={fanOpen || undefined}
          tabIndex={fanOpen ? -1 : undefined}
          onClick={onToggle}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Actions
        </Button>
        {fanOpen ? <ConversationActionsFan {...props} /> : null}
        {group ? <ConversationActionsPanel {...props} group={group} /> : null}
      </div>
    </div>
  )
}
