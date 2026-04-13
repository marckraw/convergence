import type { FC } from 'react'
import { useSessionStore } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { Play } from 'lucide-react'

interface SessionCreateInlineProps {
  workspaceId: string | null
}

export const SessionCreateInline: FC<SessionCreateInlineProps> = ({
  workspaceId,
}) => {
  const beginSessionDraft = useSessionStore((s) => s.beginSessionDraft)

  const stopSidebarEvent = (event: { stopPropagation: () => void }): void => {
    event.stopPropagation()
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={(event) => {
        stopSidebarEvent(event)
        beginSessionDraft(workspaceId)
      }}
      onMouseDown={stopSidebarEvent}
      className="flex w-full justify-start gap-1 px-2 text-muted-foreground hover:text-foreground"
    >
      <Play className="h-3 w-3" />
      New session
    </Button>
  )
}
