import type { FC, ReactNode } from 'react'
import { Button, Tooltip } from '@convergence/ui'

interface DraftStartProps {
  /** Where the conversation will start: the project's or the Space's name. */
  title: string
  /** A 12 px glyph for the place: a branch, a folder. */
  icon?: ReactNode
  /** Where it starts, in words: "Starting in main repo". */
  place?: ReactNode
  /** What to do about the place instead: "Use main repo", "Open Space". */
  action?: { label: string; onClick: () => void }
}

/**
 * The top of a conversation that hasn't started yet (CONV-21, MAR-3617): its
 * place's name, the question, and where it will start, with a way to start
 * somewhere else. A project session and a Space attempt draw the same block,
 * so they can't drift apart; the composer goes under it.
 */
export const DraftStart: FC<DraftStartProps> = ({
  title,
  icon,
  place,
  action,
}) => (
  <>
    <Tooltip label={title} when="truncated">
      <p className="mb-1 max-w-full truncate text-lg font-medium">{title}</p>
    </Tooltip>
    <p className="mb-3 text-sm text-ink-muted">
      What would you like to work on?
    </p>
    {place == null ? null : (
      <div className="mb-5 flex items-center gap-2 rounded-full border border-line bg-surface-muted/40 px-3 py-1 text-xs text-ink-muted">
        {icon == null ? null : (
          <span aria-hidden className="flex shrink-0 [&_svg]:size-3">
            {icon}
          </span>
        )}
        <span>{place}</span>
        {action ? (
          <Button variant="link" onClick={action.onClick} className="ml-1">
            {action.label}
          </Button>
        ) : null}
      </div>
    )}
  </>
)

/** The place's name, in the ink, inside DraftStart's `place` words. */
export const DraftPlaceName: FC<{ children: ReactNode }> = ({ children }) => (
  <span className="font-medium text-ink">{children}</span>
)
