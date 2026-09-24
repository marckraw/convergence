import type { FC } from 'react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import type { TranscriptViewMode } from './transcript-view-mode.api'

interface TranscriptViewSwitchProps {
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

/** The conversation's Compact/Full choice (MAR-3391 R5), in its header. */
export const TranscriptViewSwitch: FC<TranscriptViewSwitchProps> = ({
  mode,
  onChange,
}) => (
  <div
    role="group"
    aria-label="Conversation view"
    className="flex shrink-0 items-center rounded-md border border-border/60 p-0.5"
  >
    {OPTIONS.map((option) => (
      <Button
        key={option.mode}
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={mode === option.mode}
        title={option.title}
        onClick={() => onChange(option.mode)}
        className={cn(
          'h-6 rounded px-2 py-0.5 text-xs font-normal text-muted-foreground hover:text-foreground',
          mode === option.mode && 'bg-muted text-foreground',
        )}
      >
        {option.label}
      </Button>
    ))}
  </div>
)
