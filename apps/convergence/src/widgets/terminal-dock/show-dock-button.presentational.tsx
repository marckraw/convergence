import type { FC } from 'react'
import { TerminalSquare } from 'lucide-react'
import { StatusPillButton, Tooltip } from '@convergence/ui'

interface ShowDockButtonProps {
  /** The terminals the hidden dock still holds, each one open. */
  terminals: number
  /** The key that does the same, in words ("⌘`"), for its tooltip (NAV-23). */
  shortcut?: string
  onShow: () => void
}

/** "1 terminal open", "2 terminals open": what the hidden dock holds. */
function terminalsOpenLabel(terminals: number): string {
  return `${terminals} ${terminals === 1 ? 'terminal' : 'terminals'} open`
}

/**
 * Show terminal: the way back to a terminal dock that Hide terminal (or ⌘`)
 * put away while its terminals kept running. It brings the dock back as ⌘`
 * does, and it shows only while there is a hidden dock to bring back.
 *
 * Why it sits in the window's status bar, at its end: a hidden panel is
 * looked for at the window's foot, and the bar is the foot. A bottom dock
 * folds away right above it, and a side dock's edge meets it at its corner,
 * so the eye that saw the dock go finds this where it went. The bar is
 * already there, so the conversation gives up no row for it: an edge of its
 * own, where the dock's edge was, would have drawn a second thin strip over
 * the bar. And the bar speaks in pressable states (a project's chip, the
 * last to finish), which is what this is: the terminals still open, with a
 * terminal glyph and their count, pressed to bring them back. The header's
 * Project › Close terminal is the other terminal control, and ends them.
 */
export const ShowDockButton: FC<ShowDockButtonProps> = ({
  terminals,
  shortcut,
  onShow,
}) => {
  const open = terminalsOpenLabel(terminals)
  return (
    <Tooltip label="Show terminal" detail={open} shortcut={shortcut}>
      <StatusPillButton
        type="button"
        aria-label="Show terminal"
        // The count is said as well as drawn.
        aria-description={open}
        leading={<TerminalSquare className="size-3" />}
        onClick={onShow}
      >
        {terminals}
      </StatusPillButton>
    </Tooltip>
  )
}
