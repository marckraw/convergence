import type { FC, ReactNode } from 'react'
import { CopyButton } from '@convergence/ui'
import { copyButtonSlot } from './conversation-item.styles'

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
    <div className={copyButtonSlot}>
      <CopyButton text={copyText} />
    </div>
  </div>
)
