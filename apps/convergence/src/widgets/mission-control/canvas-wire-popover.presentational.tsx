import type { FC } from 'react'
import { X } from 'lucide-react'
import { RelayHopRow, formatArmedLabel } from '@/features/mission-control'
import type { RelayHopLine, RelaySentence } from '@/features/mission-control'
import {
  EmptyState,
  IconButton,
  Popover,
  PopoverContent,
  StatusDot,
} from '@convergence/ui'

/** A point in the viewport: where the wire was clicked. */
export interface CanvasWirePoint {
  x: number
  y: number
}

interface CanvasWirePopoverProps {
  sentence: RelaySentence
  armed: boolean
  /** Newest first, already trimmed to what a popover should hold. */
  hopLines: RelayHopLine[]
  /** Where the wire was clicked; the popover hangs from it. */
  at?: CanvasWirePoint
  onClose: () => void
}

/** The click point as an anchor Base UI can position against. */
const pointAnchor = (point: CanvasWirePoint) => ({
  getBoundingClientRect: () =>
    ({
      x: point.x,
      y: point.y,
      left: point.x,
      top: point.y,
      right: point.x,
      bottom: point.y,
      width: 0,
      height: 0,
      toJSON: () => point,
    }) as DOMRect,
})

/**
 * What one wire is and what it has been doing, opened by clicking it.
 *
 * The sentence comes from the same builder the Flow strip uses, and the rows
 * are the trail's own rows -- a wire must not be able to describe itself two
 * different ways in two different views. Read-only, like the canvas: the switch
 * stays in the Flow strip, where the wire is also listed in words.
 *
 * A real Popover (MC-5), hung from the point the wire was clicked: it takes the
 * focus when it opens, keeps itself on screen, and closes on Escape, on a click
 * elsewhere, or on its ✕.
 */
export const CanvasWirePopover: FC<CanvasWirePopoverProps> = ({
  sentence,
  armed,
  hopLines,
  at,
  onClose,
}) => (
  <Popover
    open
    onOpenChange={(open) => {
      if (!open) onClose()
    }}
  >
    <PopoverContent
      data-canvas-wire-popover
      anchor={at ? pointAnchor(at) : undefined}
      side="bottom"
      align="start"
      collisionPadding={8}
      aria-label={sentence.text}
      className="flex w-80 flex-col gap-2 p-3"
    >
      <div className="flex items-start gap-2">
        <StatusDot
          tone={armed ? 'success' : 'neutral'}
          size="sm"
          className="mt-1"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-xs leading-snug text-ink">{sentence.text}</p>
          <span className="text-2xs text-ink-muted">
            {formatArmedLabel(armed)}
          </span>
        </div>

        <IconButton
          label="Close wire details"
          type="button"
          variant="quiet"
          onClick={onClose}
          size="xs"
          className="shrink-0"
        >
          <X className="size-3" />
        </IconButton>
      </div>

      {hopLines.length === 0 ? (
        // An empty trail says so as every list does (MC-9).
        <EmptyState
          size="compact"
          variant="plain"
          detail="This wire has not fired yet."
        />
      ) : (
        <ul className="flex flex-col gap-0.5">
          {hopLines.map((line, index) => (
            <RelayHopRow
              // Rows here are read, never expanded: the popover is a glance, and
              // the crew's own trail is where a payload gets opened up. So no
              // onToggle, and no control that would do nothing (MC N4).
              key={`${line.timeLabel}-${index}`}
              line={line}
            />
          ))}
        </ul>
      )}
    </PopoverContent>
  </Popover>
)
