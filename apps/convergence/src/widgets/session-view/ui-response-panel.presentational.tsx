import type { FC } from 'react'
import type { UiResponseArtifact } from '@/entities/ui-response-artifact'
import {
  buildUiResponseSrcDoc,
  validateUiResponseHtml,
} from '@/entities/ui-response-artifact'
import { cn } from '@/shared/lib/cn.pure'
import { AlertTriangle, Code2 } from 'lucide-react'

interface UiResponsePanelProps {
  artifact: UiResponseArtifact
  className?: string
}

export const UiResponsePanel: FC<UiResponsePanelProps> = ({
  artifact,
  className,
}) => {
  const validation = validateUiResponseHtml(artifact.html)

  return (
    <aside
      className={cn(
        'flex min-h-0 min-w-0 flex-col bg-background/30',
        className,
      )}
      data-testid="ui-response-panel"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{artifact.title}</p>
        </div>
        <span className="rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          HTML
        </span>
      </div>

      {validation.status === 'valid' ? (
        <iframe
          title={artifact.title}
          sandbox="allow-scripts"
          srcDoc={buildUiResponseSrcDoc(artifact.html)}
          className="min-h-0 flex-1 border-0 bg-white"
          data-testid="ui-response-iframe"
        />
      ) : (
        <div
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
          data-testid="ui-response-placeholder"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-warning/30 bg-warning/10 text-warning-foreground">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="max-w-sm space-y-1">
            <p className="text-sm font-medium">
              {validation.status === 'empty'
                ? 'UI response is empty'
                : 'UI response could not render'}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              {validation.message}
            </p>
          </div>
        </div>
      )}
    </aside>
  )
}
