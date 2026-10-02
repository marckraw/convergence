import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn, ListRow, Tooltip } from '@convergence/ui'
import { disclosureChevronClass } from './sidebar.styles'

interface TreeDisclosureRowProps {
  /** What it holds: a branch's name, "Archived". */
  title: string
  /** Its glyph after the chevron: a branch, an archive box. */
  icon: ReactNode
  /** Its rows are shown. */
  expanded: boolean
  /** A search holds every row open, so this one can't fold; its tooltip says why. */
  locked?: boolean
  /** The tooltip's words; the title unless told otherwise. */
  tooltip?: string
  /** A second, muted line in the tooltip. */
  tooltipDetail?: string
  /** Its name when its words alone don't say what it does. */
  ariaLabel?: string
  /** Badges after the title: Merged, Worktree removed. */
  marks?: ReactNode
  /** How many rows it holds. */
  count?: number
  /** Its ⋯ menu, shown with the row and for the keyboard. */
  actions?: ReactNode
  onToggle: () => void
}

/**
 * A row in the project tree that folds the rows under it: a branch, or the
 * archived pile (NAV-5, NAV-13). A ListRow in the sidebar's compact print,
 * its chevron turning a quarter when open and standing still under reduced
 * motion. It says whether it is open with aria-expanded; the tooltip host
 * hides a tooltip only on an open popup trigger (`aria-haspopup`), so an open
 * branch keeps its name.
 */
export function TreeDisclosureRow({
  title,
  icon,
  expanded,
  locked = false,
  tooltip,
  tooltipDetail,
  ariaLabel,
  marks,
  count,
  actions,
  onToggle,
}: TreeDisclosureRowProps) {
  return (
    <Tooltip side="right" label={tooltip ?? title} detail={tooltipDetail}>
      <ListRow
        density="compact"
        // Locked by a search, it stays reachable and says why (R2): not
        // native `disabled`, which would take it out of Tab and hide the
        // reason from focus.
        render={<button type="button" className="aria-disabled:opacity-50" />}
        aria-disabled={locked || undefined}
        aria-description={locked ? tooltipDetail : undefined}
        aria-label={ariaLabel}
        aria-expanded={expanded}
        onClick={() => {
          if (!locked) onToggle()
        }}
        leading={
          <span className="flex items-center gap-1">
            <ChevronRight
              aria-hidden
              className={cn(
                disclosureChevronClass,
                'size-3',
                expanded && 'rotate-90',
              )}
            />
            {icon}
          </span>
        }
        title={title}
        marks={marks}
        trailing={count === undefined ? undefined : count}
        actions={actions}
      />
    </Tooltip>
  )
}
