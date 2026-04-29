import type { FC, ReactNode } from 'react'
import { ConversationItemTimestamp } from './conversation-item-timestamp.presentational'
import type { ConversationItemTiming } from './transcript-entry.pure'

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
  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pr-10 text-xs font-medium text-muted-foreground">
    <span>{label}</span>
    {children}
    <ConversationItemTimestamp createdAt={createdAt} timing={timing} />
  </p>
)
