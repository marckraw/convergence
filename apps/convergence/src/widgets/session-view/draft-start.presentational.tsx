import type { FC, ReactNode } from 'react'
import { Button, StatusPill, Tooltip } from '@convergence/ui'

interface DraftStartProps {
  /** Where the conversation will start: the project's or the Space's name. */
  title: string
  /** A 12 px glyph for the place: a branch, a folder. */
  icon?: ReactNode
  /** Where it starts, in words: "Starting in main repo", "Starting in worktree". */
  place?: string
  /** The place's name after the words, in the ink: a branch, a Space. */
  placeName?: string
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
  placeName,
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
      // Where it starts is a fact in a pill, the neutral StatusPill of the
      // composer's row size (DS-9), with its way out at its end.
      <StatusPill
        size="sm"
        className="mb-5"
        leading={
          icon == null ? undefined : (
            <span aria-hidden className="flex [&_svg]:size-3">
              {icon}
            </span>
          )
        }
        action={
          action ? (
            <Button variant="link" onClick={action.onClick}>
              {action.label}
            </Button>
          ) : undefined
        }
      >
        {place}
        {placeName ? (
          <>
            : <span className="font-medium text-ink">{placeName}</span>
          </>
        ) : null}
      </StatusPill>
    )}
  </>
)
