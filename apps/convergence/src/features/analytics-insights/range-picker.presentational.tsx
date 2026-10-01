import type { FC } from 'react'
import type { AnalyticsRangePreset } from '@/entities/analytics'
import { Button, cn } from '@convergence/ui'
import { getRangeLabel } from './analytics-insights.pure'

const RANGE_PRESETS: AnalyticsRangePreset[] = ['7d', '30d', '90d', 'all']

interface RangePickerProps {
  value: AnalyticsRangePreset
  disabled?: boolean
  onChange: (preset: AnalyticsRangePreset) => void
}

export const RangePicker: FC<RangePickerProps> = ({
  value,
  disabled = false,
  onChange,
}) => {
  return (
    <div
      className="inline-flex rounded-lg border border-border bg-background p-1"
      aria-label="Analytics range"
    >
      {RANGE_PRESETS.map((preset) => {
        const selected = preset === value
        return (
          <Button
            key={preset}
            type="button"
            variant={selected ? 'tonal' : 'ghost'}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(preset)}
            size="sm"
            className={cn(
              'rounded-md px-2.5 text-[11px]',
              selected && 'shadow-none ring-1 ring-ring',
            )}
          >
            {getRangeLabel(preset)}
          </Button>
        )
      })}
    </div>
  )
}
