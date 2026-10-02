import type { FC } from 'react'
import {
  cn,
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@convergence/ui'
import { LOOM_OUTSIDE_NAME, type LoomOutsideView } from './loom-outside.pure'
import { LoomIssueCard } from './loom-issue-card.presentational'
import {
  LOOM_SHEET_NOTE_CLASS,
  WAVE_SECTION_TITLE_CLASS,
} from './wave-panel.styles'

const LIST_ID = 'loom-not-in-the-loop'

/**
 * The last group in Plan (MAR-3236 R6): folded until a person opens it, and
 * then the project's open issues without a Loom label, newest first.
 *
 * A row is a plain link to the issue in Linear -- no button, no detail: an
 * issue outside the loop has no ledger row for Loom to read in place.
 * Folded means ABSENT, not hidden: the rows are not in the document until
 * the group is open, so a screen reader meets one line, not a backlog. A
 * Collapsible (MC-17), whose panel unmounts while folded.
 */
export const LoomOutsideGroupView: FC<{
  view: LoomOutsideView
  open: boolean
  onToggle: () => void
}> = ({ view, open, onToggle }) => (
  <Collapsible
    render={<section />}
    open={open}
    onOpenChange={() => onToggle()}
    aria-label={LOOM_OUTSIDE_NAME}
    data-loom-outside=""
    className="mt-2 flex flex-col"
  >
    {view.foldable ? (
      <CollapsibleTrigger
        className={cn(
          WAVE_SECTION_TITLE_CLASS,
          'w-full rounded-md hover:bg-fill-hover',
        )}
      >
        {view.title}
      </CollapsibleTrigger>
    ) : (
      // Never a heading: Plan's headings are its stages (MAR-3194), and this
      // group is not one -- its title is its control when there is anything
      // to open, and plain text when there is not.
      <p data-loom-outside-title="" className={WAVE_SECTION_TITLE_CLASS}>
        {view.title}
      </p>
    )}
    {view.emptyLine ? (
      <p className={LOOM_SHEET_NOTE_CLASS}>{view.emptyLine}</p>
    ) : null}
    {view.foldable ? (
      <CollapsiblePanel id={LIST_ID} className="flex flex-col">
        {view.rows.map((issue) => (
          // The whole card is the link to Linear, in the one card an issue
          // in the loop wears too (MC-35), so an outside row cannot drift
          // from an inside one.
          <LoomIssueCard
            key={issue.id}
            data-loom-outside-row={issue.identifier}
            className="mb-2"
            identifier={issue.identifier}
            title={issue.title}
            trackerStatus={issue.status}
            labels={issue.labels}
            door={{ kind: 'link', href: issue.url }}
          />
        ))}
        {view.moreLine ? (
          <p className={LOOM_SHEET_NOTE_CLASS}>{view.moreLine}</p>
        ) : null}
      </CollapsiblePanel>
    ) : null}
  </Collapsible>
)
