import type { FC } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { LOOM_OUTSIDE_NAME, type LoomOutsideView } from './loom-outside.pure'
import {
  LOOM_SHEET_NOTE_CLASS,
  WAVE_ROW_CLASS,
  WAVE_ROW_OPENABLE_CLASS,
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
 * the group is open, so a screen reader meets one line, not a backlog.
 */
export const LoomOutsideGroupView: FC<{
  view: LoomOutsideView
  open: boolean
  onToggle: () => void
}> = ({ view, open, onToggle }) => (
  <section
    aria-label={LOOM_OUTSIDE_NAME}
    data-loom-outside=""
    className="mt-2 flex flex-col"
  >
    {view.foldable ? (
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        aria-controls={LIST_ID}
        onClick={onToggle}
        className={cn(
          WAVE_SECTION_TITLE_CLASS,
          'h-auto justify-start gap-1 rounded-md hover:bg-white/5',
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn('size-3 transition-transform', open && 'rotate-90')}
        />
        {view.title}
      </Button>
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
    {view.foldable && open ? (
      <div id={LIST_ID} className="flex flex-col">
        {view.rows.map((issue) => (
          <a
            key={issue.id}
            data-loom-outside-row={issue.identifier}
            href={issue.url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              WAVE_ROW_CLASS,
              WAVE_ROW_OPENABLE_CLASS,
              'mb-2 gap-2 rounded-lg border border-foreground/5 bg-foreground/[0.02] p-3',
            )}
          >
            <span className="flex w-full flex-wrap items-baseline gap-1.5">
              <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                {issue.identifier}
              </span>
              <span
                className="line-clamp-2 w-full min-w-0 text-xs font-medium leading-relaxed"
                title={issue.title}
              >
                {issue.title}
              </span>
            </span>
            <span className="flex max-w-full flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              <span className="rounded bg-foreground/5 px-1.5 py-0.5">
                Linear: {issue.status || 'not seen'}
              </span>
              {issue.labels.map((label) => (
                <span
                  key={label}
                  className="rounded bg-foreground/5 px-1.5 py-0.5"
                >
                  {label}
                </span>
              ))}
            </span>
          </a>
        ))}
        {view.moreLine ? (
          <p className={LOOM_SHEET_NOTE_CLASS}>{view.moreLine}</p>
        ) : null}
      </div>
    ) : null}
  </section>
)
