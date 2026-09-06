import type { FC } from 'react'

interface HistoryFactProps {
  label: string
  value: string
}

/** One recorded fact, exactly as it was written down. */
export const HistoryFact: FC<HistoryFactProps> = ({ label, value }) => (
  <p className="flex gap-2 text-[11px]">
    <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
    <span className="min-w-0 flex-1 break-words">{value}</span>
  </p>
)
