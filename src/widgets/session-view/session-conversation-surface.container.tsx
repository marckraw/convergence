import type { FC } from 'react'
import type { ConversationItem, Session } from '@/entities/session'
import {
  ComposerContainer,
  type ComposerSessionContext,
} from '@/features/composer'
import { SessionTranscript } from './session-transcript.container'

interface SessionConversationSurfaceProps {
  session: Session
  conversationItems: ConversationItem[]
  composerContext: ComposerSessionContext | null
  composerDisabledReason?: string | null
  onApprove: (sessionId: string) => void
  onDeny: (sessionId: string) => void
}

export const SessionConversationSurface: FC<
  SessionConversationSurfaceProps
> = ({
  session,
  conversationItems,
  composerContext,
  composerDisabledReason = null,
  onApprove,
  onDeny,
}) => (
  <div className="flex min-h-0 flex-1 flex-col">
    <SessionTranscript
      session={session}
      conversationItems={conversationItems}
      onApprove={onApprove}
      onDeny={onDeny}
    />

    <div className="shrink-0 px-4 py-3">
      {composerDisabledReason ? (
        <div className="mx-auto w-full max-w-2xl rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
          {composerDisabledReason}
        </div>
      ) : composerContext ? (
        <ComposerContainer context={composerContext} />
      ) : null}
    </div>
  </div>
)
