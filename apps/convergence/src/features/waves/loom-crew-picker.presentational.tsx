import type { FC } from 'react'
import { Link2 } from 'lucide-react'
import {
  cn,
  IconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@convergence/ui'
import { LOOM_FOLLOW_LABEL } from './loom-follow.pure'
import { NO_DRAG_STYLE } from './wave-panel.styles'
import type { LoomSubline } from './loom-stack.types'

/**
 * The subline's words, or -- when more than one crew reads a tracker -- the
 * crew picker in the crew's place (MAR-3225 R3).
 *
 * One component for both shells, so compact and expanded cannot come to
 * disagree about when there is a choice. Either shape fills the subline box
 * the shell draws around it, and neither shape is a paragraph holding a
 * control (MAR-3284 R4): the words are a `<p>`, the picker is not inside one.
 */
export const LoomSublineContent: FC<{ subline: LoomSubline }> = ({
  subline,
}) => {
  if (subline.picker === null) return <p>{subline.text}</p>
  const { options, selectedId, onSelect, follow } = subline.picker
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1">
      <Select
        items={options.map((option) => ({
          value: option.id,
          label: option.name,
        }))}
        value={selectedId}
        onValueChange={(id) => onSelect(id)}
      >
        <SelectTrigger
          aria-label="Crew"
          // Expanded Loom's header is the window's drag strip (MAR-3284 R1):
          // the trigger, like every control of the kit, is app-no-drag.
          size="sm"
          className="inline-flex max-w-full gap-1 px-2"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          alignItemWithTrigger={false}
          align="start"
          // The list is portalled to the body, so it inherits none of Loom's
          // no-drag cover and opens exactly where a covered view's own drag
          // strip lies (MAR-3284 R2): every popup layer of the kit is
          // app-no-drag, so the items nearest the header are the list's.
          // The list is portalled, but React bubbles its keydown through the
          // React tree -- into the shells' Escape handlers, which fold Loom
          // or close a detail. Escape here is the list's own: it closes the
          // list (Base UI listens on the document) and nothing else.
          onKeyDown={(event) => {
            if (event.key === 'Escape') event.stopPropagation()
          }}
        >
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* An icon and no words (MAR-3291 R3): the subline is the crew's line,
          and a sentence's worth of label beside the picker would be a second
          thing to read on it. What it does is said to a screen reader, and
          shown by whether it is pressed. */}
      <IconButton
        label={LOOM_FOLLOW_LABEL}
        type="button"
        variant="ghost"
        aria-pressed={follow.on}
        style={NO_DRAG_STYLE}
        onClick={() => follow.onToggle(!follow.on)}
        size="sm"
        className={cn(
          'shrink-0 text-muted-foreground',
          follow.on && 'bg-accent text-accent-foreground',
        )}
      >
        <Link2 aria-hidden="true" className="size-3.5" />
      </IconButton>
    </span>
  )
}
