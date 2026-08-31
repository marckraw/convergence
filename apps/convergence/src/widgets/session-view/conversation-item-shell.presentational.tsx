import type { FC, ReactNode } from 'react'
import { CopyButton } from '@/shared/ui/copy-button'

interface ConversationItemShellProps {
  copyText: string
  children: ReactNode
}

export const ConversationItemShell: FC<ConversationItemShellProps> = ({
  copyText,
  children,
}) => (
  <div className="group/item relative">
    {children}
    <div className="absolute right-2 top-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/item:opacity-100">
      <CopyButton text={copyText} />
    </div>
  </div>
)
