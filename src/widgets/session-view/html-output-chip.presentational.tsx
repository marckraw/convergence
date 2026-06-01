import type { FC } from 'react'
import type { SessionHtmlOutput } from '@/entities/session-html-output'
import { Button } from '@/shared/ui/button'
import { Code2 } from 'lucide-react'

interface HtmlOutputChipProps {
  output: SessionHtmlOutput
  onOpen?: (output: SessionHtmlOutput) => void
}

export const HtmlOutputChip: FC<HtmlOutputChipProps> = ({ output, onOpen }) => {
  const label =
    output.status === 'ready'
      ? 'HTML preview'
      : output.status === 'failed'
        ? 'HTML failed'
        : 'HTML pending'

  if (output.status !== 'ready') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        title={output.error ?? label}
        data-testid="html-output-indicator"
      >
        <Code2 className="h-3 w-3" />
        {label}
      </span>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-auto gap-1 rounded-full border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      title="Preview generated HTML"
      data-testid="html-output-indicator"
      onClick={(event) => {
        event.stopPropagation()
        onOpen?.(output)
      }}
    >
      <Code2 className="h-3 w-3" />
      {label}
    </Button>
  )
}
