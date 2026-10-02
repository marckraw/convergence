import type { FC } from 'react'
import { ChevronRight, Layers } from 'lucide-react'
import { Button, cn, Tooltip } from '@convergence/ui'
import { WORK_BLOCK_SENTENCE_CLASS } from './work-block.styles'

interface WorkBlockRowProps {
  /** Built from the members' own fields by `workBlockLabel` (R2). */
  label: string
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
 */
export const WorkBlockRow: FC<WorkBlockRowProps> = ({
  label,
  memberCount,
  open,
  working,
  sentence = null,
  onToggle,
}) => (
  <div className="py-1">
    <Tooltip
      label={`${memberCount} ${memberCount === 1 ? 'entry' : 'entries'} · ${open ? 'fold' : 'open'}`}
    >
      <Button
        type="button"
        variant="ghost"
        data-testid="work-block"
        data-working={working ? 'true' : undefined}
        aria-expanded={open}
        onClick={onToggle}
        size="lg"
        className="h-auto w-full min-w-0 justify-start rounded-md border border-line-soft bg-surface-muted/20 px-2 py-1.5 text-left font-normal hover:bg-surface-muted/40"
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform',
            open && 'rotate-90',
          )}
        />
        <Layers className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
          {label}
        </span>
      </Button>
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
