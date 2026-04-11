import { useState } from 'react'
import type { FC } from 'react'
import { useSessionStore } from '@/entities/session'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'
import { Play } from 'lucide-react'

interface SessionCreateInlineProps {
  projectId: string
  workspaceId: string | null
}

export const SessionCreateInline: FC<SessionCreateInlineProps> = ({
  projectId,
  workspaceId,
}) => {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [expanded, setExpanded] = useState(false)
  const createAndStartSession = useSessionStore((s) => s.createAndStartSession)

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Play className="h-3 w-3" />
        New session
      </button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim() || !message.trim()) return
        createAndStartSession(
          projectId,
          workspaceId,
          'fake',
          name.trim(),
          message.trim(),
        )
        setName('')
        setMessage('')
        setExpanded(false)
      }}
      className="space-y-1 rounded border p-2"
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Session name..."
        className="h-7 text-xs"
        autoFocus
      />
      <div className="flex gap-1">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Initial message..."
          className="h-7 text-xs"
        />
        <Button
          type="submit"
          size="icon"
          className="h-7 w-7 shrink-0"
          disabled={!name.trim() || !message.trim()}
        >
          <Play className="h-3 w-3" />
        </Button>
      </div>
    </form>
  )
}
