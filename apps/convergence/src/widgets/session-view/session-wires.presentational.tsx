import type { ComponentPropsWithoutRef, FC } from 'react'
import { Waypoints } from 'lucide-react'
import {
  Button,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from '@convergence/ui'
import { formatSessionWireCount } from './session-wires.pure'

export interface SessionWireLine {
  relayId: string
  armed: boolean
  /** The wire's own sentence, from `buildRelaySentence`. */
  text: string
}

/** Focus props for the popover's content (MAR-3427 A). */
export type SessionWiresContentFocus = Pick<
  ComponentPropsWithoutRef<typeof PopoverContent>,
  'onCloseAutoFocus' | 'onInteractOutside'
>

interface SessionWiresProps {
  lines: SessionWireLine[]
  armedCount: number
  summary: string
  /**
   * Focus handling for the menu's content, from a header that may have moved
   * this control into More (MAR-3427 A).
   */
  contentFocus?: SessionWiresContentFocus
}

/**
 * What leaves this session, read from inside it (F11, MAR-2538).
 *
 * A chip that counts, and a popover that reads the wires out in the same
 * sentences the crew screen uses -- `buildRelaySentence` is the one place those
 * words live, so this surface cannot drift into a second vocabulary for the
 * same wire.
 *
 * Read-only on purpose: no arming, editing or deleting. Wires are drawn in
 * Mission Control, and a second place able to change them is a second place
 * able to disagree about them.
 */
export const SessionWires: FC<SessionWiresProps> = ({
  lines,
  armedCount,
  summary,
  contentFocus,
}) => {
  // Nothing leaves this session: no chip, no empty state, no placeholder. A
  // composer with no wires should look like it always did.
  if (lines.length === 0) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Tooltip label={summary}>
          <Button
            type="button"
            variant="ghost"
            aria-label={summary}
            size="sm"
            className={cn(
              'rounded-full border border-border/70 text-[11px]',
              armedCount === 0 ? 'text-muted-foreground/60' : 'text-foreground',
            )}
          >
            <Waypoints className="h-3.5 w-3.5" />
            {formatSessionWireCount(lines.length)}
          </Button>
        </Tooltip>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-2" {...contentFocus}>
        <ul className="flex flex-col gap-1">
          {lines.map((line) => (
            <li
              key={line.relayId}
              className={cn(
                'rounded-md px-2 py-1.5 text-xs leading-relaxed',
                // Grey regardless of any crew accent: a disarmed wire is a
                // switch at rest, and colour would argue otherwise.
                line.armed
                  ? 'text-foreground'
                  : 'text-muted-foreground/60 line-through decoration-1',
              )}
            >
              {line.text}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
