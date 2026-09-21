import type { FC } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { LOOM_NO_DRAG_STYLE } from './wave-panel.styles'
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
  const { options, selectedId, onSelect } = subline.picker
  return (
    <Select value={selectedId} onValueChange={onSelect}>
      <SelectTrigger
        aria-label="Crew"
        size="sm"
        className="inline-flex h-7 max-w-full gap-1 px-2 text-xs"
        // Expanded Loom's header is the window's drag strip (MAR-3284 R1),
        // so the trigger has to say it is not.
        style={LOOM_NO_DRAG_STYLE}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="start"
        // The list is portalled to the body, so it inherits none of Loom's
        // no-drag cover and opens exactly where a covered view's own drag
        // strip lies (MAR-3284 R2). Without this the items nearest the header
        // are the window's, not the list's -- what
        // `shared/ui/dropdown-menu.tsx:18` already does for menus.
        style={LOOM_NO_DRAG_STYLE}
        // The list is portalled, but React bubbles its keydown through the
        // React tree -- into the shells' Escape handlers, which fold Loom
        // or close a detail. Escape here is the list's own: it closes the
        // list (Radix listens on the document) and nothing else.
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
  )
}
