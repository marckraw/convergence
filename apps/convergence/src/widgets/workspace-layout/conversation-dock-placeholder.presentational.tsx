import type { FC } from 'react'
import { workspaceLayoutStyles } from './workspace-layout.styles'

/**
 * The dock of a terminal session's workspace: there is no conversation to
 * show. (Its "coming soon" variant, for a Convert that no caller passed,
 * went with that prop: NAV-34.)
 */
export const ConversationDockPlaceholder: FC = () => (
  <div
    className={workspaceLayoutStyles.conversationDock}
    data-testid="conversation-dock-placeholder"
  >
    <span className={workspaceLayoutStyles.conversationDockTitle}>
      No conversation history
    </span>
    <span className={workspaceLayoutStyles.conversationDockBody}>
      This terminal session does not have an AI provider attached. Convert it to
      a conversation session to talk to an agent in this workspace.
    </span>
  </div>
)
