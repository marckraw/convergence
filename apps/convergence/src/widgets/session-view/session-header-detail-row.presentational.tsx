import type { FC, ReactNode } from 'react'
import { DescriptionItem } from '@convergence/ui'

interface SessionHeaderDetailRowProps {
  icon?: ReactNode
  label: string
  /** Its value: words, or a MetaLine of facts (CONV-23). */
  value: ReactNode
  testId?: string
}

/**
 * One of the header's Details: a DescriptionItem in the inline list Details
 * draws (CONV-24), its glyph before the term and its slot kept when it has
 * none, so the terms line up. It sits in a DescriptionList.
 */
export const SessionHeaderDetailRow: FC<SessionHeaderDetailRowProps> = ({
  icon,
  label,
  value,
  testId,
}) => (
  <DescriptionItem
    term={label}
    icon={icon ?? null}
    className="rounded-md px-2 py-1.5"
    data-testid={testId}
  >
    {value}
  </DescriptionItem>
)
