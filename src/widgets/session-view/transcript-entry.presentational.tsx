import type { FC } from 'react'
import type { TranscriptEntry } from '@/entities/session'
import {
  User,
  Bot,
  Wrench,
  Terminal,
  AlertTriangle,
  Info,
  ChevronRight,
} from 'lucide-react'
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
            <details className="group min-w-0 rounded-md border border-border/60 bg-muted/20">
              <summary className="flex cursor-pointer list-none items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
                <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                  {getToolPreview(`${entry.tool}: ${entry.input}`)}
                </span>
              </summary>
              <pre className="app-scrollbar overflow-x-auto border-t border-border/60 px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {entry.input}
              </pre>
            </details>
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
            <details className="group min-w-0 rounded-md border border-border/60 bg-muted/20">
              <summary className="flex cursor-pointer list-none items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
                <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                  {getToolPreview(entry.result)}
                </span>
              </summary>
              <pre className="app-scrollbar overflow-x-auto border-t border-border/60 px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {entry.result}
              </pre>
            </details>
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

function getToolPreview(value: string): string {
  const singleLine = value.replace(/\s+/g, ' ').trim()
  if (singleLine.length <= 120) {
    return singleLine
  }

  return `${singleLine.slice(0, 117)}...`
}
