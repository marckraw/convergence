import type { FC } from 'react'

export const TargetFact: FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="min-w-0 rounded-md border border-border bg-card p-3">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="mt-1 truncate text-sm font-semibold">{value}</p>
  </div>
)
