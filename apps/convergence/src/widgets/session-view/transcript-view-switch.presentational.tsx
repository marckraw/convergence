import type { FC } from 'react'
import { MenuRadioGroup, MenuRadioItem, Tooltip } from '@convergence/ui'
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
 * inside the header's View menu (MAR-3429 CH4 R1): the menu's own radio
 * items (MAR-3616), with a check on the one chosen. The group keeps the name
 * the segmented switch had, "Conversation view", and choosing closes the
 * menu.
 */
export const TranscriptViewMenuItems: FC<TranscriptViewMenuItemsProps> = ({
  mode,
  onChange,
}) => (
  <MenuRadioGroup
    aria-label="Conversation view"
    value={mode}
    onValueChange={(next: TranscriptViewMode) => onChange(next)}
  >
    {OPTIONS.map((option) => (
      <Tooltip key={option.mode} label={option.title} side="right">
        <MenuRadioItem value={option.mode} closeOnClick>
          {option.label}
        </MenuRadioItem>
      </Tooltip>
    ))}
  </MenuRadioGroup>
)
