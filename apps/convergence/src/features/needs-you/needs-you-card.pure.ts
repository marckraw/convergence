import {
  formatSessionAttentionLabel,
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
  const working =
    !waiting &&
    session.attention !== 'failed' &&
    (session.status === 'running' ||
      (Boolean(parallelSummary) && Boolean(session.parallelWork?.running)))
  const review =
    session.attention === 'failed' ||
    (session.attention === 'finished' && !working)
  return {
    session,
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
    summary:
      waiting || review
        ? formatSessionAttentionLabel(session)
        : working
          ? session.status === 'running'
            ? 'Working'
            : parallelSummary
          : null,
    dismissLabel: waiting ? 'Snooze' : review ? 'Acknowledge' : null,
    attentionGroup: waiting ? 'Waiting on you' : review ? 'Needs review' : null,
    dismissed: context.dismissed ?? false,
  }
}
export type NeedsYouCardModel = ReturnType<typeof needsYouCardModel>

export function groupNeedsYou(
  cards: NeedsYouCardModel[],
): { title: string; cards: NeedsYouCardModel[] }[] {
  const titles = [
    'Pinned',
    'Waiting on you',
    'Needs review',
    'Working',
    'Errands with a PR',
  ]
  const groups = titles.map((title) => ({
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
