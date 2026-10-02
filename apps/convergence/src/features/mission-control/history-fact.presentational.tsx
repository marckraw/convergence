import type { FC } from 'react'
import { DescriptionItem } from '@convergence/ui'

interface HistoryFactProps {
  label: string
  value: string
}

/**
 * One recorded fact, exactly as it was written down: a term and its value in
 * a DescriptionList (MC-30), so a screen reader hears each value with its name.
 */
export const HistoryFact: FC<HistoryFactProps> = ({ label, value }) => (
  <DescriptionItem term={label} className="text-2xs">
    {value}
  </DescriptionItem>
)
