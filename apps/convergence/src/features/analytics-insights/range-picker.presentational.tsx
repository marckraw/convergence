import type { FC } from 'react'
import type { AnalyticsRangePreset } from '@/entities/analytics'
import { SegmentedControl, SegmentedControlItem } from '@convergence/ui'
import { getRangeLabel } from './analytics-insights.pure'

const RANGE_PRESETS: AnalyticsRangePreset[] = ['7d', '30d', '90d', 'all']

interface RangePickerProps {
  value: AnalyticsRangePreset
  disabled?: boolean
  onChange: (preset: AnalyticsRangePreset) => void
}

/** The range the insights read, one of four (R9): a SegmentedControl. */
export const RangePicker: FC<RangePickerProps> = ({
  value,
  disabled = false,
  onChange,
}) => (
  <SegmentedControl
    aria-label="Analytics range"
    size="sm"
    value={value}
    disabled={disabled}
    onValueChange={(next: AnalyticsRangePreset) => onChange(next)}
  >
    {RANGE_PRESETS.map((preset) => (
      <SegmentedControlItem key={preset} value={preset}>
        {getRangeLabel(preset)}
      </SegmentedControlItem>
    ))}
  </SegmentedControl>
)
