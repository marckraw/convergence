import type { FC, ReactNode } from 'react'
import { cn } from '@convergence/ui'
import { ConversationItemTimestamp } from './conversation-item-timestamp.presentational'
import type { ConversationItemTiming } from './transcript-entry.pure'
import { copyButtonRoom } from './conversation-item.styles'

interface ConversationItemHeaderProps {
  createdAt: string
  label: string
  timing: ConversationItemTiming
  children?: ReactNode
}

export const ConversationItemHeader: FC<ConversationItemHeaderProps> = ({
  createdAt,
  label,
  timing,
  children,
}) => (
  <p
    className={cn(
      'flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-medium text-ink-muted',
      copyButtonRoom,
    )}
  >
    <span>{label}</span>
    {children}
    <ConversationItemTimestamp createdAt={createdAt} timing={timing} />
  </p>
)
