import { useEffect, useRef, useState, useCallback } from 'react'
import type { FC } from 'react'
import { useSessionStore } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Square, Send } from 'lucide-react'
import { AttentionIndicator } from '@/shared/ui/attention-indicator.presentational'
import { TranscriptEntryView } from './transcript-entry.presentational'

export const SessionView: FC = () => {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sessions = useSessionStore((s) => s.sessions)
  const approveSession = useSessionStore((s) => s.approveSession)
  const denySession = useSessionStore((s) => s.denySession)
  const stopSession = useSessionStore((s) => s.stopSession)
  const [message, setMessage] = useState('')
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  const session = sessions.find((s) => s.id === activeSessionId) ?? null

  const scrollToBottom = useCallback(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [session?.transcript.length, scrollToBottom])

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || !session) return
    useSessionStore.getState().loadSessions(session.projectId)
    setMessage('')
  }

  if (!session) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <p className="text-lg">No session selected</p>
        <p className="mt-2 text-sm">
          Select a session from the sidebar or start a new one.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header — also a drag region */}
      <div
        className="flex h-12 items-center justify-between border-b border-border/50 px-4"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="font-medium">{session.name}</span>
          <AttentionIndicator attention={session.attention} />
        </div>
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="text-xs text-muted-foreground">
            {session.providerId}
          </span>
          {session.status === 'running' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => stopSession(session.id)}
            >
              <Square className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto px-4">
        <div className="mx-auto max-w-2xl py-4">
          {session.transcript.map((entry, i) => {
            const isLastApproval =
              entry.type === 'approval-request' &&
              session.attention === 'needs-approval' &&
              i === session.transcript.length - 1

            return (
              <TranscriptEntryView
                key={i}
                entry={entry}
                onApprove={
                  isLastApproval ? () => approveSession(session.id) : undefined
                }
                onDeny={
                  isLastApproval ? () => denySession(session.id) : undefined
                }
              />
            )
          })}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="border-t px-4 py-3">
        <form
          onSubmit={handleSendMessage}
          className="mx-auto flex max-w-2xl gap-2"
        >
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Send a message..."
            disabled={
              session.status === 'completed' || session.status === 'failed'
            }
          />
          <Button
            type="submit"
            size="icon"
            disabled={
              !message.trim() ||
              session.status === 'completed' ||
              session.status === 'failed'
            }
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}
