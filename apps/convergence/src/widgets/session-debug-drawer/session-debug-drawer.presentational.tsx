import type { FC } from 'react'
import type { ProviderDebugEntry } from '@/entities/provider-debug'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(960px,calc(100vw-2rem))] p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-5 pr-14">
          <DialogTitle>Provider debug log</DialogTitle>
          <DialogDescription>
            Live view of every provider event captured for this session.
            Persisted to disk only when "Capture provider debug logs" is on in
            Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col px-6 py-4">
          <div className={drawerStyles.shell}>
            <div className={drawerStyles.header}>
              <span className="font-mono text-xs text-muted-foreground">
                {entries.length} entries · session {sessionId.slice(0, 8)}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
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
              </div>
            </div>

            {entries.length === 0 ? (
              <div className={drawerStyles.empty}>No events captured yet.</div>
            ) : (
              <ul className={`${drawerStyles.list} space-y-1`}>
                {entries.map((entry, index) => {
                  const payload = describePayload(entry)
                  return (
                    <li
                      key={`${entry.at}-${index}`}
                      className={drawerStyles.row}
                    >
                      <div className={drawerStyles.rowHeader}>
                        <span>{formatTime(entry.at)}</span>
                        <span className={drawerStyles.channel}>
                          {entry.channel}
                        </span>
                        <span>{entry.providerId}</span>
                        <span>{entry.direction}</span>
                        {entry.method ? (
                          <span className="text-foreground/80">
                            {entry.method}
                          </span>
                        ) : null}
                      </div>
                      {payload ? (
                        <pre className={drawerStyles.payload}>{payload}</pre>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
