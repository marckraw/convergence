import type { ComponentProps, ReactNode } from 'react'
import { cn } from '#lib/cn.pure'
import { CollapsibleTrigger } from '../../motion/collapsible/collapsible'
import { Badge } from '../badge/badge'

type SectionHeaderProps = Omit<
  ComponentProps<'div'>,
  'className' | 'children'
> & {
  className?: string
  /** The section's name: its heading's words. */
  label: ReactNode
  /** How many it holds: a number becomes a count Badge; anything else is shown as given. */
  count?: ReactNode
  /** What you can do with the section, at its end: an IconButton (New, Filter). */
  action?: ReactNode
  /** Its heading's level; h2, as the sidebar's sections are, unless told otherwise. */
  headingLevel?: 2 | 3 | 4
  /**
   * Its words open and close the section: put the header inside a Collapsible,
   * with the section's rows in its CollapsiblePanel; the Collapsible holds
   * `open` and `onOpenChange`.
   */
  collapsible?: boolean
}

/**
 * The head of a sidebar or panel section (MAR-3616): its name as a heading
 * in the sidebar's 11 px medium muted print, a count, and an action at its
 * end. One look for the sidebar's seven (NAV-12), and every section is a
 * heading, so heading navigation finds them all. Collapsible, its words are
 * the trigger, with `aria-expanded` and a chevron that turns.
 */
function SectionHeader({
  label,
  count,
  action,
  headingLevel = 2,
  collapsible = false,
  className,
  ...props
}: SectionHeaderProps) {
  const Heading = `h${headingLevel}` as const
  return (
    <div
      data-slot="section-header"
      className={cn(
        'flex min-h-6 min-w-0 items-center gap-1.5 text-2xs font-medium text-ink-muted',
        className,
      )}
      {...props}
    >
      <Heading className="flex min-w-0 flex-1 items-center">
        {collapsible ? (
          <CollapsibleTrigger className="max-w-full transition-colors hover:text-ink">
            <span className="min-w-0 truncate">{label}</span>
          </CollapsibleTrigger>
        ) : (
          <span className="min-w-0 truncate">{label}</span>
        )}
      </Heading>
      {count == null ? null : typeof count === 'number' ? (
        <Badge shape="count">{count}</Badge>
      ) : (
        <span className="shrink-0 tabular-nums">{count}</span>
      )}
      {action == null ? null : (
        <span className="app-no-drag flex shrink-0 items-center">{action}</span>
      )}
    </div>
  )
}

export { SectionHeader, type SectionHeaderProps }
