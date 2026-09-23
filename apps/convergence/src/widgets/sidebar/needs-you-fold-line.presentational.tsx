import { Fragment } from 'react'
import { cardStateTone, type FoldedSectionSummary } from '@/features/needs-you'
import { cn } from '@/shared/lib/cn.pure'

/**
 * A folded section's second line (MAR-3372): what asks, each in its state's
 * tone, then the kind line, then the projects inside — joined by `·`, each
 * part omitted when empty, and no element at all when every part is.
 */
export function FoldedLine({
  summary,
  className,
}: {
  summary: FoldedSectionSummary
  className?: string
}) {
  const parts = [
    ...summary.asks.map((ask) => (
      <span
        key={`ask:${ask.state}`}
        data-fold-ask={ask.state}
        className={cardStateTone[ask.state]}
      >
        {ask.text}
      </span>
    )),
    summary.line && <span key="kind">{summary.line}</span>,
    summary.projects.text && (
      <span key="projects" data-fold-projects="">
        {summary.projects.text}
      </span>
    ),
  ].filter(Boolean)
  if (!parts.length) return null
  return (
    <p
      data-fold-line=""
      className={cn(
        'truncate text-[10px] font-normal text-muted-foreground',
        className,
      )}
    >
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && ' · '}
          {part}
        </Fragment>
      ))}
    </p>
  )
}
