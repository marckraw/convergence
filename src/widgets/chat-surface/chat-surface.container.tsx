import type { FC } from 'react'
import { formatActivityLabel, useSessionStore } from '@/entities/session'
import { ComposerContainer } from '@/features/composer'
import { SessionConversationSurface } from '@/widgets/session-view'
import { AttentionIndicator } from '@/shared/ui/attention-indicator.presentational'
import { Button } from '@/shared/ui/button'
import { ContextWindowIndicator } from '@/shared/ui/context-window-indicator.presentational'
import { MessageSquareText, Square } from 'lucide-react'

export const ChatSurface: FC = () => {
  const sessions = useSessionStore((state) => state.globalChatSessions)
  const activeSessionId = useSessionStore(
    (state) => state.activeGlobalSessionId,
  )
  const conversationItems = useSessionStore(
    (state) => state.activeGlobalConversation,
  )
  const approveSession = useSessionStore((state) => state.approveSession)
  const denySession = useSessionStore((state) => state.denySession)
  const stopSession = useSessionStore((state) => state.stopSession)

  const session = sessions.find((entry) => entry.id === activeSessionId) ?? null
  const activityLabel = formatActivityLabel(session?.activity)

  if (!session) {
    return (
      <div className="flex h-full flex-col">
        <div
          className="flex h-12 shrink-0 items-center border-b border-border px-4"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <MessageSquareText className="h-4 w-4 text-muted-foreground" />
            Chat
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4">
          <p className="mb-1 text-lg font-medium">Convergence Chat</p>
          <p className="mb-5 text-sm text-muted-foreground">
            Start a project-free agent conversation.
          </p>
          <ComposerContainer
            context={{ kind: 'global', activeSessionId: null }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex min-w-0 items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <MessageSquareText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{session.name}</span>
          <AttentionIndicator attention={session.attention} />
          {session.archivedAt ? (
            <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
              Archived
            </span>
          ) : null}
          {activityLabel ? (
            <span
              className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground"
              data-testid="chat-session-activity-indicator"
            >
              {activityLabel}
            </span>
          ) : null}
          <ContextWindowIndicator contextWindow={session.contextWindow} />
        </div>
        {session.status === 'running' ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Stop session"
            onClick={() => stopSession(session.id)}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <Square className="h-3 w-3" />
          </Button>
        ) : null}
      </div>

      <SessionConversationSurface
        session={session}
        conversationItems={conversationItems}
        composerContext={{ kind: 'global', activeSessionId: session.id }}
        onApprove={approveSession}
        onDeny={denySession}
      />
    </div>
  )
}
