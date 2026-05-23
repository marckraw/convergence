import type { FC } from 'react'
import { Button } from '@/shared/ui/button'
import { ProjectScriptIcon } from '@/entities/project-script'
import { X } from 'lucide-react'
import { formatProjectActionTimestamp } from './project-actions-menu.pure'
import type { ProjectActionLogDrawerView } from './project-actions-menu.types'

interface ProjectActionLogDrawerPresentationalProps {
  view: ProjectActionLogDrawerView
  onStop: () => void
  onClose: () => void
}

export const ProjectActionLogDrawerPresentational: FC<
  ProjectActionLogDrawerPresentationalProps
> = ({ view, onStop, onClose }) => {
  const chunks =
    view.output.length > 0
      ? view.output
      : [
          { stream: 'stdout' as const, text: view.run.stdout },
          { stream: 'stderr' as const, text: view.run.stderr },
        ].filter((chunk) => chunk.text.length > 0)
  const running = view.run.status === 'queued' || view.run.status === 'running'

  return (
    <section className="absolute inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 shadow-2xl backdrop-blur">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
          <ProjectScriptIcon icon={view.script.icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{view.script.name}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {view.run.status} · stdin unsupported
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {running && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-destructive hover:text-destructive"
              onClick={onStop}
            >
              Stop
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            title="Close action output"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="grid max-h-72 grid-cols-[minmax(0,1fr)] gap-2 overflow-auto p-3">
        <div className="grid gap-1 text-[11px] text-muted-foreground">
          <span>cwd: {view.run.cwd}</span>
          <span>
            started: {formatProjectActionTimestamp(view.run.startedAt)}
            {view.run.endedAt
              ? ` · ended: ${formatProjectActionTimestamp(view.run.endedAt)}`
              : ''}
            {view.run.exitCode !== null ? ` · exit: ${view.run.exitCode}` : ''}
          </span>
        </div>
        <pre className="app-scrollbar max-h-52 overflow-auto rounded-md border border-border bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
          {chunks.length === 0 ? (
            <span className="text-muted-foreground">No output yet.</span>
          ) : (
            chunks.map((chunk, index) => (
              <span
                key={`${chunk.stream}-${index}`}
                className={chunk.stream === 'stderr' ? 'text-destructive' : ''}
              >
                {chunk.text}
              </span>
            ))
          )}
        </pre>
      </div>
    </section>
  )
}
