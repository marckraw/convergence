// The design system's meter: the original the app's budget meter pastes. One side of the copy lives
// in packages/ui/src, so the guard reports it only while it reads the package (MAR-3610).
export interface MeterProps {
  name: string
  value: number
  max: number
  segments: number
}

export function Meter({ name, value, max, segments }: MeterProps) {
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
