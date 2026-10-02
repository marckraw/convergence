import type { FC } from 'react'
import { ChevronRight, Layers } from 'lucide-react'
import { cn, ListRow, MetaLine, Tooltip } from '@convergence/ui'
import { WORK_BLOCK_SENTENCE_CLASS } from './work-block.styles'

interface WorkBlockRowProps {
  /**
   * Its facts, built from the members' own fields by `workBlockLabel` (R2),
   * one by one: a MetaLine joins them (CONV-23).
   */
  label: readonly string[]
  /** How many entries the block folds, for the title. */
  memberCount: number
  open: boolean
  working: boolean
  /**
   * The model's one line about this block (MAR-3395 CV3), already checked
   * against the block's own records. Absent: the row is exactly CV1's.
   */
  sentence?: string | null
  onToggle: () => void
}

/**
 * One line for a run of tool calls (MAR-3391 CV1). Controlled: whether it is
 * open lives outside the row (R3), so a row the virtualizer drops and draws
 * again comes back as it was.
 *
 * Not a Collapsible, on purpose (CONV-12): what it opens is not a panel
 * inside it but the transcript's own rows after it, each its own virtualized
 * entry, so there is no panel for Collapsible to own. It says aria-expanded
 * itself, and its one chevron turns.
 */
export const WorkBlockRow: FC<WorkBlockRowProps> = ({
  label,
  memberCount,
  open,
  working,
  sentence = null,
  onToggle,
}) => {
  const hint = `${memberCount} ${memberCount === 1 ? 'entry' : 'entries'} · ${open ? 'fold' : 'open'}`
  return (
    <div className="py-1">
      {/* A row of the transcript (DS-21): a ListRow that opens its members,
          which hang under it as rows of their own. Its hint is our tooltip
          and its description, as a Button's is. */}
      <Tooltip label={hint}>
        <ListRow
          density="dense"
          render={<button type="button" />}
          data-testid="work-block"
          data-working={working ? 'true' : undefined}
          aria-expanded={open}
          aria-description={hint}
          onClick={onToggle}
          className="rounded-md border border-line-soft bg-surface-muted/20 hover:bg-surface-muted/40"
          leading={
            <span className="flex items-center gap-2">
              {/* 16 px, as the Button it was drew them (R0). */}
              <ChevronRight
                className={cn(
                  'size-4 shrink-0 transition-transform',
                  open && 'rotate-90',
                )}
              />
              <Layers className="size-4 shrink-0" />
            </span>
          }
          title={
            <MetaLine className="text-xs text-ink-muted">{label}</MetaLine>
          }
        />
      </Tooltip>
      {sentence ? (
        // The whole sentence is our Tooltip when the line cuts it short (R2).
        <Tooltip label={sentence} when="truncated">
          <p
            data-testid="work-block-sentence"
            className={WORK_BLOCK_SENTENCE_CLASS}
          >
            {sentence}
          </p>
        </Tooltip>
      ) : null}
    </div>
  )
}
