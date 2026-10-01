// The composer's budget meter, pasted from the design system's meter and renamed.
export interface BudgetMeterProps {
  name: string
  value: number
  max: number
  segments: number
}

export function BudgetMeter({ name, value, max, segments }: BudgetMeterProps) {
  const filled = max > 0 ? Math.round((Math.min(value, max) / max) * segments) : 0
  const cells = Array.from({ length: segments }, (_, index) => index < filled)
  return (
    <div role="meter" aria-label={name} aria-valuenow={value} aria-valuemax={max}>
      {cells.map((on, index) => (
        <span key={index} data-on={on ? 'true' : 'false'} />
      ))}
      <output>
        {value} / {max}
      </output>
    </div>
  )
}
