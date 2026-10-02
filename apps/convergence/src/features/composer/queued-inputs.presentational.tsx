import type { FC } from 'react'
import { X } from 'lucide-react'
import { Button, IconButton, SectionLabel } from '@convergence/ui'
import type { QueuedInputView } from './queued-inputs.pure'

interface QueuedInputsProps {
  inputs: readonly QueuedInputView[]
  onDeliverNow: (id: string) => void
  onCancel: (id: string) => void
}

/**
 * The inputs queued behind a running turn, under the composer (CONV-30):
 * each says how it goes, when, and what it carries, with Deliver now on a
 * failed one and a Cancel that says why when it can't.
 */
export const QueuedInputs: FC<QueuedInputsProps> = ({
  inputs,
  onDeliverNow,
  onCancel,
}) =>
  inputs.length > 0 ? (
    <div
      className="mx-auto mt-2 w-full max-w-conversation rounded-md border border-line bg-surface-muted/30 px-3 py-2"
      data-testid="queued-inputs"
    >
      <div className="space-y-2">
        {inputs.map((input) => (
          <div
            key={input.id}
            className="flex items-start justify-between gap-3 text-xs"
          >
            <div className="min-w-0 flex-1">
              <SectionLabel size="sm" className="flex items-center gap-2">
                <span>{input.mode}</span>
                <span>{input.state}</span>
              </SectionLabel>
              <div className="truncate text-ink">{input.preview}</div>
              {input.error ? (
                <div className="truncate text-danger-ink">{input.error}</div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {input.canDeliverNow ? (
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="Deliver now"
                  onClick={() => onDeliverNow(input.id)}
                  size="xs"
                >
                  Deliver now
                </Button>
              ) : null}
              <IconButton
                label="Cancel queued input"
                type="button"
                variant="ghost"
                disabledReason={input.cancelUnavailable ?? undefined}
                onClick={() => onCancel(input.id)}
                size="xs"
                className="shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  ) : null
