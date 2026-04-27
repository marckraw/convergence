import type { FC, ReactNode } from 'react'
import type { ConversationItem } from '@/entities/session'
import { ConversationItemTimestamp } from './conversation-item-timestamp.presentational'

interface ConversationItemHeaderProps {
  entry: ConversationItem
  label: string
  turnStartedAt?: string | null
  children?: ReactNode
}

export const ConversationItemHeader: FC<ConversationItemHeaderProps> = ({
  entry,
  label,
  turnStartedAt,
  children,
}) => (
  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pr-10 text-xs font-medium text-muted-foreground">
    <span>{label}</span>
    {children}
    <ConversationItemTimestamp entry={entry} turnStartedAt={turnStartedAt} />
  </p>
)
