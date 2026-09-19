import type { FC } from 'react'
import { cn } from '@/shared/lib/cn.pure'
import {
  LOOM_SHEET_ICONS,
  LOOM_SHEET_ICON_CLASS,
} from './loom-stack.presentational'
import { LEARN_LOOM_TICKET } from './learn-loom-copy.pure'
import {
  learnLoomMotionStyle,
  learnLoomTicketLeft,
  learnLoomTicketMaxWidth,
  LEARN_LOOM_GEOMETRY,
  type LearnLoomStepView,
} from './learn-loom.pure'
import {
  LEARN_LOOM_EMPHASIS_CLASS,
  LEARN_LOOM_ILLUSTRATION_CLASS,
  LEARN_LOOM_MOTION_CLASS,
  LEARN_LOOM_SHEET_ACTIVE_CLASS,
  LEARN_LOOM_SHEET_CLOSED_CLASS,
  LEARN_LOOM_SHEET_CLASS,
  LEARN_LOOM_SHEET_COUNT_CLASS,
  LEARN_LOOM_SHEET_NAME_CLASS,
  LEARN_LOOM_SHEET_TRANSITION_CLASS,
  LEARN_LOOM_TICKET_CLASS,
  LEARN_LOOM_TICKET_ID_CLASS,
  LEARN_LOOM_TICKET_NOTE_CLASS,
  LEARN_LOOM_TICKET_STATUS_CLASS,
  LEARN_LOOM_TICKET_TITLE_CLASS,
  LEARN_LOOM_TICKET_TRANSITION_CLASS,
} from './learn-loom.styles'

/**
 * The four sheets and the one ticket (MAR-3201 R2, R3).
 *
 * The ticket is a SIBLING of the sheets, placed over the active one, not a
 * child of it. React cannot move a node between parents without remounting
 * it, and the lesson's whole claim is that this is one card travelling
 * through Loom rather than six cards appearing and vanishing -- which is
 * also what LL2 needs in order to animate the journey at all.
 *
 * LL2 moves it with a plain CSS transition (MAR-3202 R1). Everything that
 * changes between two steps is already a style this component writes -- the
 * ticket's `left`, each sheet's share of the row, two border colours -- so a
 * transition on those properties retargets itself when a step changes
 * mid-flight, which is R5 for free, and yields to `prefers-reduced-motion`
 * through a class, which is R6 for free. No JavaScript holds an animation,
 * so there is no queue that could lag behind a burst of presses.
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
            style={{
              ...learnLoomMotionStyle(),
              // Both states are the SAME two numbers, which is the whole of
              // LL2's mechanism: a closed sheet is `flex-basis` 136 with no
              // grow, an open one is basis 0 taking every share, and the
              // browser walks between them. The used widths are LL1's --
              // 136 closed, the rest active -- because the numbers are still
              // derived, never written twice (lap 3, F).
              flexGrow: sheet.active ? 1 : 0,
              flexBasis: sheet.active ? 0 : LEARN_LOOM_GEOMETRY.closedWidth,
              marginLeft: at > 0 ? -LEARN_LOOM_GEOMETRY.overlap : undefined,
            }}
            className={cn(
              LEARN_LOOM_SHEET_CLASS,
              LEARN_LOOM_SHEET_TRANSITION_CLASS,
              LEARN_LOOM_MOTION_CLASS,
              sheet.active
                ? LEARN_LOOM_SHEET_ACTIVE_CLASS
                : LEARN_LOOM_SHEET_CLOSED_CLASS,
              // The active sheet wears the step's colour, as its ticket does
              // (lap 3, G3); the closed ones keep the quiet border.
              sheet.active
                ? LEARN_LOOM_EMPHASIS_CLASS[view.step.emphasis]
                : undefined,
            )}
          >
            {/* The same icons as the real stack, in the same colours
                (`559:815`, `559:821`): the person is meant to recognise the
                panel behind the lesson. */}
            <Icon
              className={cn('size-[18px]', LOOM_SHEET_ICON_CLASS[sheet.sheet])}
            />
            {/* Closed sheets keep their name, icon and count, horizontal --
                the person is meant to recognise the panel behind them. */}
            <p className={LEARN_LOOM_SHEET_NAME_CLASS}>{sheet.name}</p>
            <p className={LEARN_LOOM_SHEET_COUNT_CLASS}>{sheet.title}</p>
          </div>
        )
      })}
      <div
        data-learn-loom-ticket={LEARN_LOOM_TICKET.identifier}
        style={{
          ...learnLoomMotionStyle(),
          // The one value that carries the journey. It is still the derived
          // left edge of whichever sheet is active -- LL2 changes when the
          // browser arrives at it, never where.
          left: learnLoomTicketLeft(activeAt),
          width: LEARN_LOOM_GEOMETRY.ticketWidth,
          maxWidth: learnLoomTicketMaxWidth(view.sheets.length),
        }}
        className={cn(
          LEARN_LOOM_TICKET_CLASS,
          LEARN_LOOM_TICKET_TRANSITION_CLASS,
          LEARN_LOOM_MOTION_CLASS,
          LEARN_LOOM_EMPHASIS_CLASS[view.step.emphasis],
        )}
      >
        {/* The frames' order (`559:841`-`559:844`): identifier, title, the
            status that changes, and the note about the card last. */}
        <p className={LEARN_LOOM_TICKET_ID_CLASS}>
          {LEARN_LOOM_TICKET.identifier}
        </p>
        <p className={LEARN_LOOM_TICKET_TITLE_CLASS}>
          {LEARN_LOOM_TICKET.title}
        </p>
        {/* The words change at every step; the colour never does, so the
            fact is carried by the text and not by the hue (R7). */}
        <p className={LEARN_LOOM_TICKET_STATUS_CLASS}>
          {view.step.ticketStatus}
        </p>
        <p className={LEARN_LOOM_TICKET_NOTE_CLASS}>{LEARN_LOOM_TICKET.note}</p>
      </div>
    </div>
  )
}
