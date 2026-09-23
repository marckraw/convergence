import { hostLivenessLabel } from '@/shared/lib/host-liveness.pure'
import {
  COMPACTING_CONTEXT_LABEL,
  formatSessionAttentionLabel,
  isSessionCompacting,
  type SessionSummary,
} from '@/entities/session'
import {
  executionHostEndpointDisplayName,
  isLocalExecutionHost,
} from '@/entities/execution-host'
import {
  formatRelativeTime,
  parallelWorkStatus,
} from '@/shared/lib/parallel-work.pure'
import { needsYouTiming } from './needs-you-timing.pure'
import { FEED_SECTIONS } from './needs-you-view.pure'

export interface CardContext {
  projectName: string
  endpoints: readonly { id: string; label: string }[]
  now: number
  dismissed?: boolean
}

export function needsYouCardModel(
  session: SessionSummary,
  context: CardContext,
) {
  // A repository address proves an errand even on a resident birth. Origin is
  // durable; NULL records stay unknown after the hop ledger has been cleared.
  const kind =
    session.workAddress?.mode === 'repository' || session.originKind === 'spawn'
      ? 'errand'
      : session.originKind === 'resident'
        ? 'resident'
        : null
  const endpoint = context.endpoints.find((e) => e.id === session.executionHost)
  const waiting =
    session.attention === 'needs-approval' ||
    session.attention === 'needs-input'
  const parallelSummary = parallelWorkStatus(session)
  // Between the two: not waiting on Marcin, not failed, and not silently
  // "Working" either — this row is the only place that says the app has lost
  // the wire to the machine (MAR-3051). The run itself is alive on the far
  // machine, so it is neither failed nor settled (MAR-3054 integration).
  const hostUnreachable = session.attention === 'host-unreachable'
  const failed =
    !hostUnreachable &&
    (session.attention === 'failed' || session.status === 'failed')
  // Compacting is working (MAR-3288 R5): the status still reads the last
  // turn's `completed` and the attention its `finished`, so without this the
  // card said "Finished" and offered Acknowledge while the context was being
  // rewritten underneath it.
  const compacting = !waiting && !failed && isSessionCompacting(session)
  const working =
    !waiting &&
    !failed &&
    (compacting ||
      session.status === 'running' ||
      session.status === 'answered')
  const review = failed || (session.attention === 'finished' && !working)
  return {
    session,
    hostUnreachable,
    hostLiveness: hostLivenessLabel(
      session.executionHost,
      session.executionHostLastEventAt,
      context.now,
    ),
    // No "in 3m 20s": that is the last turn's duration, and it read as the
    // length of a finished run beside a conversation that is still busy.
    timing: compacting
      ? {
          label: null,
          live: false,
          tooltip: 'Compacting context. Its duration is not recorded.',
        }
      : needsYouTiming(session, context.now),
    projectName: context.projectName,
    host: isLocalExecutionHost(session.executionHost)
      ? 'laptop'
      : endpoint
        ? executionHostEndpointDisplayName(endpoint)
        : 'Unknown endpoint',
    lastMoved: Number.isFinite(Date.parse(session.updatedAt))
      ? `${formatRelativeTime(session.updatedAt, context.now)} ago`
      : 'Time not recorded',
    prLabel: session.pullRequest
      ? `#${session.pullRequest.number} · ${session.pullRequest.state}`
      : null,
    kind,
    canArchive:
      review || (kind === 'errand' && session.pullRequest?.state === 'merged'),
    working,
    summary: hostUnreachable
      ? 'Host unreachable'
      : failed
        ? 'Failed'
        : waiting
          ? formatSessionAttentionLabel(session)
          : compacting
            ? COMPACTING_CONTEXT_LABEL
            : working
              ? session.status === 'running'
                ? 'Working'
                : parallelSummary
              : (parallelSummary ??
                (review || session.status === 'completed' ? 'Finished' : null)),
    dismissLabel: waiting ? 'Snooze' : review ? 'Acknowledge' : null,
    attentionGroup: waiting ? 'Waiting on you' : review ? 'Needs review' : null,
    dismissed: context.dismissed ?? false,
  }
}
export type NeedsYouCardModel = ReturnType<typeof needsYouCardModel>

export function groupNeedsYou(
  cards: readonly NeedsYouCardModel[],
): { title: string; cards: NeedsYouCardModel[] }[] {
  const groups = FEED_SECTIONS.map(({ source: title }) => ({
    title,
    cards: [] as NeedsYouCardModel[],
  }))
  const seen = new Set<string>()
  for (const card of cards) {
    if (card.session.archivedAt || seen.has(card.session.id)) continue
    seen.add(card.session.id)
    const title = card.session.pinnedAt
      ? 'Pinned'
      : !card.dismissed && card.attentionGroup
        ? card.attentionGroup
        : card.working
          ? 'Working'
          : card.kind === 'errand' && card.session.pullRequest
            ? 'Errands with a PR'
            : null
    groups.find((group) => group.title === title)?.cards.push(card)
  }
  return groups
    .filter((g) => g.cards.length > 0)
    .map((group) => ({
      ...group,
      cards: group.cards.sort(
        (a, b) =>
          b.session.updatedAt.localeCompare(a.session.updatedAt) ||
          a.session.id.localeCompare(b.session.id),
      ),
    }))
}
