import type { FC } from 'react'
import { Button } from '@/shared/ui/button'
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
 * full contrast. Never a disabled input — a fact that looks like a field reads
 * as a field somebody locked.
 */
export const SeatFacts: FC<SeatFactsProps> = ({ heading, facts }) => (
  <section aria-label="Facts" data-seat-facts className="flex flex-col gap-1.5">
    <h5 className="text-[10px] uppercase tracking-wide text-muted-foreground">
      {heading}
    </h5>
    <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1 text-[11px]">
      {facts.map((fact) => (
        <div key={fact.term} className="contents">
          <dt className="text-muted-foreground">{fact.term}</dt>
          <dd className="flex min-w-0 items-center gap-1 text-foreground">
            <span className="min-w-0 flex-1 truncate">{fact.value}</span>
            {fact.open ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={fact.open.label}
                onClick={fact.open.onOpen}
                className="size-5 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              >
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Button>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  </section>
)
