import type { FC } from 'react'
import { DropdownMenuItem } from '@/shared/ui/dropdown-menu'
import type { TranscriptViewMode } from './transcript-view-mode.api'

interface TranscriptViewMenuItemsProps {
  mode: TranscriptViewMode
  onChange: (mode: TranscriptViewMode) => void
}

const OPTIONS: ReadonlyArray<{
  mode: TranscriptViewMode
  label: string
  title: string
}> = [
  {
    mode: 'compact',
    label: 'Compact',
    title: 'Fold runs of tool calls into one line each',
  },
  { mode: 'full', label: 'Full', title: 'Show every entry' },
]

/**
 * The conversation's Compact/Full choice (MAR-3391 R5) as a radio choice
 * inside the header's View menu (MAR-3429 CH4 R1). The group keeps the name
 * the segmented switch had, "Conversation view".
 */
export const TranscriptViewMenuItems: FC<TranscriptViewMenuItemsProps> = ({
  mode,
  onChange,
}) => (
  <div role="group" aria-label="Conversation view">
    {OPTIONS.map((option) => (
      <DropdownMenuItem
        key={option.mode}
        role="menuitemradio"
        aria-checked={mode === option.mode}
        title={option.title}
        onSelect={() => onChange(option.mode)}
        className="gap-2"
      >
        <span
          aria-hidden
          className={
            mode === option.mode
              ? 'h-1.5 w-1.5 rounded-full bg-foreground'
              : 'h-1.5 w-1.5'
          }
        />
        {option.label}
      </DropdownMenuItem>
    ))}
  </div>
)
