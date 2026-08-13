import type { FC } from 'react'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'
import { cn } from '@/shared/lib/cn.pure'
import type { HailOutcome } from './session-hail-outcome.pure'

interface HailComposerProps {
  sessionName: string
  value: string
  outcome: HailOutcome
  sending: boolean
  error: string | null
  onChange: (value: string) => void
  onSend: () => void
  onCancel: () => void
}

export const HailComposer: FC<HailComposerProps> = ({
  sessionName,
  value,
  outcome,
  sending,
  error,
  onChange,
  onSend,
  onCancel,
}) => {
  const canSend = !outcome.disabled && !sending && value.trim().length > 0

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        autoFocus
        rows={2}
        value={value}
        disabled={outcome.disabled || sending}
        placeholder={`Hail ${sessionName}…`}
        aria-label={`Hail message to ${sessionName}`}
        className="resize-none text-xs"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
            return
          }
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            if (canSend) onSend()
          }
        }}
      />

      <div className="flex items-center justify-between gap-2">
        {/* The honest label: what this send will do, before it does it. */}
        <span
          className={cn(
            'min-w-0 truncate text-[11px]',
            outcome.disabled || error
              ? 'text-destructive'
              : 'text-muted-foreground',
          )}
        >
          {error ?? outcome.label}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-6 px-2 text-[11px]"
            disabled={!canSend}
            onClick={onSend}
          >
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  )
}
