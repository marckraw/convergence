import type { FC } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { LOOM_SUBLINE_TAIL } from './loom-sheets.pure'
import type { LoomSubline } from './loom-stack.types'

/**
 * The subline's words, or -- when more than one crew reads a tracker -- the
 * crew picker in the crew's place (MAR-3225 R3).
 *
 * One component for both shells, so compact and expanded cannot come to
 * disagree about when there is a choice. With one crew it returns the text
 * exactly as the shells drew it before, so their markup is unchanged.
 */
export const LoomSublineContent: FC<{ subline: LoomSubline }> = ({
  subline,
}) => {
  if (subline.picker === null) return <>{subline.text}</>
  const { options, selectedId, onSelect } = subline.picker
  return (
    <>
      <Select value={selectedId} onValueChange={onSelect}>
        <SelectTrigger
          aria-label="Crew"
          size="sm"
          className="inline-flex h-7 max-w-full gap-1 px-2 text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="start"
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
      {` · ${LOOM_SUBLINE_TAIL}`}
    </>
  )
}
