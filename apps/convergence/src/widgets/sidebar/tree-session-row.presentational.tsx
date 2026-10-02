import type { ReactNode } from 'react'
import { Cloud, TerminalSquare } from 'lucide-react'
import { SessionStateBadge, type SessionSummary } from '@/entities/session'
import { isRemoteExecutionHost } from '@/entities/execution-host'
import { parallelWorkStatus } from '@/shared/lib/parallel-work.pure'
import { ListRow, Spinner, Tooltip, cn, toneInk } from '@convergence/ui'

interface TreeSessionRowProps {
  session: SessionSummary
  /** It is the conversation on screen: the selected fill and aria-current (R7). */
  selected: boolean
  /** A notification just touched it: one ring pulse. */
  pulsing?: boolean
  /** Its name is being regenerated: a spinner, and the tooltip says so. */
  regeneratingName?: boolean
  onSelect: () => void
  /** A double click starts renaming it. */
  onRename: () => void
  /** Its ⋯ menu, shown with the row and for the keyboard. */
  actions?: ReactNode
}

/**
 * A session as one line of the project tree (NAV-5): a terminal, or a
 * conversation while its card is being renamed. A ListRow in the sidebar's
 * compact print: its state glyph, its name, what it is doing in parallel
 * under it, and a cloud when it runs on a remote host.
 */
export function TreeSessionRow({
  session,
  selected,
  pulsing = false,
  regeneratingName = false,
  onSelect,
  onRename,
  actions,
}: TreeSessionRowProps) {
  const remote = isRemoteExecutionHost(session.executionHost)
  return (
    <Tooltip
      label={
        regeneratingName ? `${session.name} (regenerating name…)` : session.name
      }
      side="right"
    >
      <ListRow
        density="compact"
        selected={selected}
        render={<button type="button" />}
        data-pulse={pulsing ? 'true' : undefined}
        onClick={onSelect}
        onDoubleClick={onRename}
        leading={
          session.providerId === 'shell' ? (
            <TerminalSquare className="size-3" aria-label="Terminal session" />
          ) : (
            <SessionStateBadge session={session} />
          )
        }
        title={session.name}
        meta={parallelWorkStatus(session) || undefined}
        marks={
          remote || regeneratingName ? (
            <>
              {remote ? (
                <Cloud
                  className={cn('size-3', toneInk.info)}
                  aria-label="Runs on remote execution host"
                />
              ) : null}
              {regeneratingName ? (
                <Spinner
                  size="xs"
                  label="Regenerating name"
                  className="text-ink-muted"
                />
              ) : null}
            </>
          ) : undefined
        }
        actions={actions}
      />
    </Tooltip>
  )
}
