import type { FC } from 'react'
import { workspaceLayoutStyles } from './workspace-layout.styles'

export interface ConversationDockPlaceholderProps {
  onConvert?: () => void
}

export const ConversationDockPlaceholder: FC<
  ConversationDockPlaceholderProps
> = ({ onConvert }) => (
  <div
    className={workspaceLayoutStyles.conversationDock}
    data-testid="conversation-dock-placeholder"
  >
    <span className={workspaceLayoutStyles.conversationDockTitle}>
      No conversation history
    </span>
    <span className={workspaceLayoutStyles.conversationDockBody}>
      This terminal session does not have an AI provider attached. Convert it to
      a conversation session to talk to an agent in this workspace
      {onConvert ? ' (coming soon).' : '.'}
    </span>
  </div>
)
