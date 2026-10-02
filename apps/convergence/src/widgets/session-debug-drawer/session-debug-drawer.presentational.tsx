import type { FC } from 'react'
import type { ProviderDebugEntry } from '@/entities/provider-debug'
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@convergence/ui'
import { drawerStyles } from './session-debug-drawer.styles'

interface SessionDebugDrawerProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  sessionId: string
  entries: ProviderDebugEntry[]
  onCopyAll: () => void
  onOpenLogFolder: () => void
}

function formatTime(ms: number): string {
  const date = new Date(ms)
  const hh = date.getHours().toString().padStart(2, '0')
  const mm = date.getMinutes().toString().padStart(2, '0')
  const ss = date.getSeconds().toString().padStart(2, '0')
  const millis = date.getMilliseconds().toString().padStart(3, '0')
  return `${hh}:${mm}:${ss}.${millis}`
}

function describePayload(entry: ProviderDebugEntry): string | null {
  if (entry.payload === undefined && entry.bytes === undefined && !entry.note) {
    return null
  }
  const parts: string[] = []
  if (entry.note) parts.push(entry.note)
  if (entry.bytes !== undefined) parts.push(`${entry.bytes} bytes`)
  if (entry.payload !== undefined) {
    try {
      parts.push(JSON.stringify(entry.payload))
    } catch {
      parts.push('<unserializable>')
    }
  }
  return parts.join(' • ')
}

export const SessionDebugDrawer: FC<SessionDebugDrawerProps> = ({
  open,
  onOpenChange,
  sessionId,
  entries,
  onCopyAll,
  onOpenLogFolder,
}) => {
  return (
    <Dialog open={open} onOpenChange={(open) => onOpenChange(open)}>
      {/*
        A log you watch and leave (R6): its actions in the header, no footer.
        Tall, so it doesn't grow as events stream in; the body is the one
        scrolling region, and the keyboard can scroll it.
      */}
      <DialogContent size="xl" height="tall">
        <DialogHeader
          actions={
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onCopyAll}
                disabled={entries.length === 0}
              >
                Copy all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onOpenLogFolder}
              >
                Open log folder
              </Button>
            </>
          }
        >
          <DialogTitle>Provider debug log</DialogTitle>
          <DialogDescription>
            Live view of every provider event captured for this session.
            Persisted to disk only when "Capture provider debug logs" is on in
            Settings.
          </DialogDescription>
        </DialogHeader>

        <DialogBody
          tabIndex={0}
          role="region"
          aria-label="Provider events"
          className="app-scrollbar"
        >
          <p className={drawerStyles.count}>
            {entries.length} entries · session {sessionId.slice(0, 8)}
          </p>
          {entries.length === 0 ? (
            <div className={drawerStyles.empty}>No events captured yet.</div>
          ) : (
            <ul className={drawerStyles.list}>
              {entries.map((entry, index) => {
                const payload = describePayload(entry)
                return (
                  <li key={`${entry.at}-${index}`} className={drawerStyles.row}>
                    <div className={drawerStyles.rowHeader}>
                      <span>{formatTime(entry.at)}</span>
                      <span className={drawerStyles.channel}>
                        {entry.channel}
                      </span>
                      <span>{entry.providerId}</span>
                      <span>{entry.direction}</span>
                      {entry.method ? (
                        <span className="text-ink/80">{entry.method}</span>
                      ) : null}
                    </div>
                    {payload ? (
                      // raw-element: one event's payload in the row's own small print, dozens to a page; CodeBlock's framed box would wrap each
                      <pre className={drawerStyles.payload}>{payload}</pre>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
