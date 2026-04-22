import type { FC, ReactNode } from 'react'
import type { ConversationItem } from '@/entities/session'
import { CopyButton } from '@/shared/ui/copy-button'
import { getConversationItemCopyText } from './transcript-entry.pure'

interface ConversationItemShellProps {
  item: ConversationItem
  children: ReactNode
}

export const ConversationItemShell: FC<ConversationItemShellProps> = ({
  item,
  children,
}) => (
  <div className="group/item relative">
    {children}
    <div className="absolute right-2 top-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/item:opacity-100">
      <CopyButton text={getConversationItemCopyText(item)} />
    </div>
  </div>
)
