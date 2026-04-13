import type { FC } from 'react'
import type { TranscriptEntry } from '@/entities/session'
import { User, Bot, Wrench, Terminal, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Markdown } from '@/shared/ui/markdown.presentational'

interface TranscriptEntryViewProps {
  entry: TranscriptEntry
  onApprove?: () => void
  onDeny?: () => void
}

export const TranscriptEntryView: FC<TranscriptEntryViewProps> = ({
  entry,
  onApprove,
  onDeny,
}) => {
  switch (entry.type) {
    case 'user':
      return (
        <div className="flex gap-3 py-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-xs font-medium text-muted-foreground">You</p>
            <Markdown
              className="mt-1 text-foreground"
              content={entry.text}
              size="sm"
            />
          </div>
        </div>
      )

    case 'assistant':
      return (
        <div className="flex gap-3 py-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-600 text-white">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-xs font-medium text-muted-foreground">Agent</p>
            <Markdown
              className="mt-1 text-foreground"
              content={entry.text}
              size="sm"
            />
          </div>
        </div>
      )

    case 'tool-use':
      return (
        <div className="flex gap-3 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <p className="font-mono text-xs text-muted-foreground">
              {entry.tool}: {entry.input}
            </p>
          </div>
        </div>
      )

    case 'tool-result':
      return (
        <div className="flex gap-3 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <p className="font-mono text-xs text-muted-foreground">
              {entry.result}
            </p>
          </div>
        </div>
      )

    case 'approval-request':
      return (
        <div className="my-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Approval needed</p>
              <Markdown
                className="mt-1 text-muted-foreground"
                content={entry.description}
                size="sm"
              />
              {onApprove && onDeny && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={onApprove}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      'bg-primary text-primary-foreground hover:bg-primary/90',
                    )}
                  >
                    Approve
                  </button>
                  <button
                    onClick={onDeny}
                    className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
                  >
                    Deny
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )

    case 'input-request':
      return (
        <div className="my-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Input needed</p>
              <Markdown
                className="mt-1 text-muted-foreground"
                content={entry.prompt}
                size="sm"
              />
            </div>
          </div>
        </div>
      )

    case 'system':
      return (
        <div className="py-2 text-center">
          <Markdown
            className="text-xs italic text-muted-foreground"
            content={entry.text}
            size="sm"
          />
        </div>
      )

    default:
      return null
  }
}
