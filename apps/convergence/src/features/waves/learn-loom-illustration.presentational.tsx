import type { FC } from 'react'
import { cn } from '@/shared/lib/cn.pure'
import { LOOM_SHEET_ICONS } from './loom-stack.presentational'
import { LEARN_LOOM_TICKET } from './learn-loom-copy.pure'
import type { LearnLoomStepView } from './learn-loom.pure'
import {
  LEARN_LOOM_EMPHASIS_CLASS,
  LEARN_LOOM_ILLUSTRATION_CLASS,
  LEARN_LOOM_SHEET_ACTIVE_CLASS,
  LEARN_LOOM_SHEET_CLOSED_CLASS,
  LEARN_LOOM_SHEET_CLASS,
  LEARN_LOOM_SHEET_COUNT_CLASS,
  LEARN_LOOM_SHEET_NAME_CLASS,
  LEARN_LOOM_SHEET_OVERLAP_CLASS,
  LEARN_LOOM_TICKET_CLASS,
  LEARN_LOOM_TICKET_ID_CLASS,
  LEARN_LOOM_TICKET_NOTE_CLASS,
  LEARN_LOOM_TICKET_STATUS_CLASS,
  LEARN_LOOM_TICKET_TITLE_CLASS,
} from './learn-loom.styles'

/** A closed sheet is 136 wide and overlaps its neighbour by 24 (R10). */
const CLOSED_STRIDE = 112
/** The ticket sits 18 in from the active sheet's left edge. */
const TICKET_INSET = 18

/**
 * The four sheets and the one ticket (MAR-3201 R2, R3).
 *
 * The ticket is a SIBLING of the sheets, placed over the active one, not a
 * child of it. React cannot move a node between parents without remounting
 * it, and the lesson's whole claim is that this is one card travelling
 * through Loom rather than six cards appearing and vanishing -- which is
 * also what LL2 needs in order to animate the journey at all.
 */
export const LearnLoomIllustrationView: FC<{ view: LearnLoomStepView }> = ({
  view,
}) => {
  const activeAt = view.sheets.findIndex((sheet) => sheet.active)
  return (
    <div
      data-learn-loom-illustration
      aria-hidden
      className={cn(LEARN_LOOM_ILLUSTRATION_CLASS, 'relative')}
    >
      {view.sheets.map((sheet, at) => {
        const Icon = LOOM_SHEET_ICONS[sheet.sheet]
        return (
          <div
            key={sheet.sheet}
            data-learn-loom-sheet={sheet.sheet}
            data-learn-loom-active={sheet.active ? 'true' : 'false'}
            className={cn(
              LEARN_LOOM_SHEET_CLASS,
              sheet.active
                ? LEARN_LOOM_SHEET_ACTIVE_CLASS
                : LEARN_LOOM_SHEET_CLOSED_CLASS,
              at > 0 && LEARN_LOOM_SHEET_OVERLAP_CLASS,
            )}
          >
            <Icon className="size-[18px] text-muted-foreground" />
            {/* Closed sheets keep their name, icon and count, horizontal --
                the person is meant to recognise the panel behind them. */}
            <p className={cn(LEARN_LOOM_SHEET_NAME_CLASS, 'mt-1.5')}>
              {sheet.name}
            </p>
            <p className={LEARN_LOOM_SHEET_COUNT_CLASS}>{sheet.title}</p>
          </div>
        )
      })}
      <div
        data-learn-loom-ticket={LEARN_LOOM_TICKET.identifier}
        style={{ left: activeAt * CLOSED_STRIDE + TICKET_INSET }}
        className={cn(
          LEARN_LOOM_TICKET_CLASS,
          LEARN_LOOM_EMPHASIS_CLASS[view.step.emphasis],
        )}
      >
        <p className={LEARN_LOOM_TICKET_NOTE_CLASS}>{LEARN_LOOM_TICKET.note}</p>
        <p className={LEARN_LOOM_TICKET_ID_CLASS}>
          {LEARN_LOOM_TICKET.identifier}
        </p>
        <p className={LEARN_LOOM_TICKET_TITLE_CLASS}>
          {LEARN_LOOM_TICKET.title}
        </p>
        {/* The status line changes with the emphasis, so the colour is never
            the only thing that moved (R7). */}
        <p className={LEARN_LOOM_TICKET_STATUS_CLASS[view.step.emphasis]}>
          {view.step.ticketStatus}
        </p>
      </div>
    </div>
  )
}
