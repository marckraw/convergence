import type { FC } from 'react'
import { X } from 'lucide-react'
import { RelayHopRow, formatArmedLabel } from '@/features/mission-control'
import type { RelayHopLine, RelaySentence } from '@/features/mission-control'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'

interface CanvasWirePopoverProps {
  sentence: RelaySentence
  armed: boolean
  /** Newest first, already trimmed to what a popover should hold. */
  hopLines: RelayHopLine[]
  onClose: () => void
}

/**
 * What one wire is and what it has been doing, opened by clicking it.
 *
 * The sentence comes from the same builder the Flow strip uses, and the rows
 * are the trail's own rows -- a wire must not be able to describe itself two
 * different ways in two different views. Read-only, like the canvas: the switch
 * stays in the Flow strip, where the wire is also listed in words.
 */
export const CanvasWirePopover: FC<CanvasWirePopoverProps> = ({
  sentence,
  armed,
  hopLines,
  onClose,
}) => (
  <div
    data-canvas-wire-popover
    role="dialog"
    aria-label={sentence.text}
    className="flex w-80 flex-col gap-2 rounded-lg border border-border bg-popover/95 p-3 shadow-lg backdrop-blur-sm"
  >
    <div className="flex items-start gap-2">
      <span
        className={cn(
          'mt-1 size-1.5 shrink-0 rounded-full',
          armed ? 'bg-emerald-500/70' : 'bg-muted-foreground/50',
        )}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-xs leading-snug text-foreground">{sentence.text}</p>
        <span className="text-[11px] text-muted-foreground">
          {formatArmedLabel(armed)}
        </span>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Close wire details"
        onClick={onClose}
        className="size-5 shrink-0 p-0 text-muted-foreground hover:text-foreground"
      >
        <X className="size-3" />
      </Button>
    </div>

    {hopLines.length === 0 ? (
      <p className="text-[11px] text-muted-foreground">
        This wire has not fired yet.
      </p>
    ) : (
      <ul className="flex flex-col gap-0.5">
        {hopLines.map((line, index) => (
          <RelayHopRow
            // Rows here are read, never expanded: the popover is a glance, and
            // the crew's own trail is where a payload gets opened up.
            key={`${line.timeLabel}-${index}`}
            line={line}
            expanded={false}
            onToggle={() => undefined}
          />
        ))}
      </ul>
    )}
  </div>
)
