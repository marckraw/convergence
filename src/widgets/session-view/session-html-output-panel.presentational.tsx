import type { FC } from 'react'
import type { SessionHtmlOutput } from '@/entities/session-html-output'
import {
  buildUiResponseSrcDoc,
  validateUiResponseHtml,
} from '@/entities/ui-response-artifact'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'
import { AlertTriangle, Code2, ExternalLink, Loader2 } from 'lucide-react'
import { SessionHtmlOutputPanelMessage } from './session-html-output-panel-message.presentational'

interface SessionHtmlOutputPanelProps {
  output: SessionHtmlOutput
  html: string | null
  isLoading?: boolean
  error?: string | null
  onOpenInBrowser?: (output: SessionHtmlOutput) => void
  className?: string
}

export const SessionHtmlOutputPanel: FC<SessionHtmlOutputPanelProps> = ({
  output,
  html,
  isLoading = false,
  error = null,
  onOpenInBrowser,
  className,
}) => {
  const validation =
    output.status === 'ready' && html ? validateUiResponseHtml(html) : null

  return (
    <aside
      className={cn(
        'flex min-h-0 min-w-0 flex-col bg-background/30',
        className,
      )}
      data-testid="session-html-output-panel"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">
            HTML preview {output.relativePath ? `- ${output.relativePath}` : ''}
          </p>
        </div>
        <span className="rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {output.status}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Open HTML in browser"
          disabled={output.status !== 'ready' || !onOpenInBrowser}
          onClick={() => onOpenInBrowser?.(output)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>

      {renderBody({ output, html, validation, isLoading, error })}
    </aside>
  )
}

function renderBody(input: {
  output: SessionHtmlOutput
  html: string | null
  validation: ReturnType<typeof validateUiResponseHtml> | null
  isLoading: boolean
  error: string | null
}) {
  const { output, html, validation, isLoading, error } = input

  if (isLoading) {
    return (
      <SessionHtmlOutputPanelMessage
        icon={<Loader2 className="h-5 w-5 animate-spin" />}
        title="Loading HTML preview"
        message="The generated HTML is being read from session storage."
        testId="session-html-output-loading"
      />
    )
  }

  if (output.status === 'failed') {
    return (
      <SessionHtmlOutputPanelMessage
        icon={<AlertTriangle className="h-5 w-5" />}
        title="HTML generation failed"
        message={output.error ?? 'The HTML output could not be generated.'}
        testId="session-html-output-placeholder"
        warning
      />
    )
  }

  if (output.status === 'pending') {
    return (
      <SessionHtmlOutputPanelMessage
        icon={<Loader2 className="h-5 w-5 animate-spin" />}
        title="HTML generation pending"
        message="The HTML output has not finished generating yet."
        testId="session-html-output-placeholder"
      />
    )
  }

  if (error) {
    return (
      <SessionHtmlOutputPanelMessage
        icon={<AlertTriangle className="h-5 w-5" />}
        title="HTML preview could not load"
        message={error}
        testId="session-html-output-placeholder"
        warning
      />
    )
  }

  if (!html || validation?.status !== 'valid') {
    const validationMessage =
      validation && validation.status !== 'valid'
        ? validation.message
        : 'The generated HTML is not valid.'
    return (
      <SessionHtmlOutputPanelMessage
        icon={<AlertTriangle className="h-5 w-5" />}
        title={!html ? 'HTML output is empty' : 'HTML output could not render'}
        message={
          !html
            ? 'The selected HTML output did not include any readable HTML.'
            : validationMessage
        }
        testId="session-html-output-placeholder"
        warning
      />
    )
  }

  return (
    <iframe
      title="HTML preview"
      sandbox="allow-scripts"
      srcDoc={buildUiResponseSrcDoc(html)}
      className="min-h-0 flex-1 border-0 bg-white"
      data-testid="session-html-output-iframe"
    />
  )
}
