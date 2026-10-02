import type { FC } from 'react'
import {
  DescriptionItem,
  DescriptionList,
  IconButton,
  SectionLabel,
} from '@convergence/ui'
import { ArrowUpRight } from 'lucide-react'

export interface SeatFact {
  term: string
  value: string
  /** An action beside the value — the resident's "open conversation". */
  open?: { label: string; onOpen: () => void }
}

interface SeatFactsProps {
  heading: string
  facts: readonly SeatFact[]
}

/**
 * What a seat IS and nobody edits here (MAR-3118 R4): plain key/value text at
 * full contrast, in a DescriptionList (MC-30). Never a disabled input — a fact
 * that looks like a field reads as a field somebody locked.
 */
export const SeatFacts: FC<SeatFactsProps> = ({ heading, facts }) => (
  <section aria-label="Facts" data-seat-facts className="flex flex-col gap-1.5">
    <SectionLabel as="h4" className="text-3xs">
      {heading}
    </SectionLabel>
    <DescriptionList layout="inline" density="compact">
      {facts.map((fact) => (
        <DescriptionItem key={fact.term} term={fact.term} className="text-2xs">
          <span className="flex min-w-0 items-center justify-end gap-1 text-2xs">
            <span className="min-w-0 truncate">{fact.value}</span>
            {fact.open ? (
              <IconButton
                label={fact.open.label}
                type="button"
                variant="quiet"
                onClick={fact.open.onOpen}
                size="xs"
                className="shrink-0"
              >
                <ArrowUpRight aria-hidden className="size-3.5" />
              </IconButton>
            ) : null}
          </span>
        </DescriptionItem>
      ))}
    </DescriptionList>
  </section>
)
