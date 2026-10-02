import type { FC, ReactNode } from 'react'
import {
  Archive,
  Cloud,
  GitBranch,
  GitFork,
  GitPullRequest,
} from 'lucide-react'
import { Button, cn, DescriptionList, focusRingInset } from '@convergence/ui'
import { DETAILS_SECTION } from './conversation-details-menu.container'
import type { RemoteSessionDetailRows } from './remote-session-details.pure'
import { SessionHeaderDetailRow } from './session-header-detail-row.presentational'

export interface SessionDetailsProps {
  /** The conversation this one was forked from: its name, and opening it. */
  parent: { name: string; onOpen: () => void } | null
  /**
   * A remote session's rows (MAR-2718), or null on a local session. Null is
   * what draws the local Branch and Pull request rows, so the two readings
   * are exclusive by construction.
   */
  remote: RemoteSessionDetailRows | null
  /** The local checkout's branch, when it has been read. */
  branchName: string | null
  /** The pull request's reading: "#12 · open", "PR checking…". */
  pullRequest: ReactNode
  /** What the agent is doing now, when it says. */
  activity: string | null
  /** The agent's working time, a row of its own that ticks while it streams. */
  elapsed: ReactNode
  /** How full the context window is. */
  context: string
  archived: boolean
  /** The harness history's sections, when the provider records them. */
  harness: ReactNode
  /** The agent meter, when there is a reading or the session is remote. */
  agent: ReactNode
}

/**
 * What the header's Details holds (CONV-30): the session's facts as terms
 * and values, then the harness history, then the agent meter. Each section
 * carries `DETAILS_SECTION`, so Details can open at it.
 */
export const SessionDetails: FC<SessionDetailsProps> = ({
  parent,
  remote,
  branchName,
  pullRequest,
  activity,
  elapsed,
  context,
  archived,
  harness,
  agent,
}) => (
  <>
    <section aria-label="Session" {...{ [DETAILS_SECTION]: 'session' }}>
      <div className="grid gap-1.5 text-xs">
        {parent && (
          <Button
            type="button"
            variant="ghost"
            onClick={parent.onOpen}
            size="sm"
            className="justify-start gap-2"
          >
            <GitFork className="h-3.5 w-3.5" />
            Forked from: {parent.name}
          </Button>
        )}
        {/* The facts as terms and values (CONV-24). */}
        <DescriptionList layout="inline" density="compact" className="gap-1.5">
          {remote ? (
            <>
              <SessionHeaderDetailRow
                icon={<Cloud className="h-3.5 w-3.5" />}
                label="Execution host"
                value="Remote daemon"
              />
              {/*
                What this session was told, above what the daemon says it
                did (MAR-2689). A row written before the work address existed
                reads "Unknown" rather than a repository re-derived from a
                local checkout it may never have matched.
              */}
              <SessionHeaderDetailRow label="Works in" value={remote.worksIn} />
              {remote.remoteRepository && (
                <SessionHeaderDetailRow
                  label="Remote repository"
                  value={remote.remoteRepository}
                />
              )}
              {remote.branch && (
                <SessionHeaderDetailRow
                  icon={<GitBranch className="h-3.5 w-3.5" />}
                  label="Remote branch"
                  value={remote.branch}
                />
              )}
              {remote.requestedBranch && (
                <SessionHeaderDetailRow
                  label="Branch requested"
                  value={remote.requestedBranch}
                />
              )}
              <SessionHeaderDetailRow
                icon={<GitPullRequest className="h-3.5 w-3.5" />}
                label="Pull request"
                value={pullRequest}
              />
              {remote.unreadable && (
                <SessionHeaderDetailRow
                  label="Remote workspace"
                  value={remote.unreadable}
                />
              )}
            </>
          ) : (
            <>
              <SessionHeaderDetailRow
                icon={<GitBranch className="h-3.5 w-3.5" />}
                label="Checkout branch"
                value={branchName ?? 'Unknown'}
              />
              <SessionHeaderDetailRow
                icon={<GitPullRequest className="h-3.5 w-3.5" />}
                label="Pull request"
                value={pullRequest}
              />
            </>
          )}
          {activity && (
            <SessionHeaderDetailRow label="Activity" value={activity} />
          )}
          {elapsed}
          <SessionHeaderDetailRow label="Context" value={context} />
          {archived && (
            <SessionHeaderDetailRow
              icon={<Archive className="h-3.5 w-3.5" />}
              label="State"
              value="Archived"
            />
          )}
        </DescriptionList>
      </div>
    </section>
    {harness && (
      // Named by its label, with no heading of its own: the harness's own
      // "Harness" section is the one heading (lap 2 E). The chip focuses it,
      // and the ring shows where focus landed.
      <section
        aria-label="Harness history"
        tabIndex={-1}
        className={cn(
          'mt-2 rounded-sm border-t border-line-soft px-2 pt-2',
          focusRingInset,
        )}
        {...{ [DETAILS_SECTION]: 'harness' }}
      >
        {harness}
      </section>
    )}
    {agent && (
      <section
        aria-label="Agent"
        className="mt-2 border-t border-line-soft pt-2"
        {...{ [DETAILS_SECTION]: 'agent' }}
      >
        {agent}
      </section>
    )}
  </>
)
