import { resolveProviderIcon } from '@/shared/ui/provider-icon.pure'
import type { NeedsYouCardModel } from './needs-you-card.pure'
import { pullRequestPresentation } from './pull-request-presentation.pure'

export const feedFacets = {
  status: 'Status',
  provider: 'Provider',
  model: 'Model',
  project: 'Project',
  host: 'Host',
  kind: 'Conversation type',
  pr: 'Pull request',
} as const
export type FeedFacet = keyof typeof feedFacets
export type FeedGroup = { title: string; cards: NeedsYouCardModel[] }
export const workflowOrder = [
  'Pinned',
  'Waiting on you',
  'Needs review',
  'Working',
  'Errands with a PR',
]
export interface FeedView {
  query: string
  filters: Partial<Record<FeedFacet, string[]>>
  groupBy: 'workflow' | 'status' | 'project' | 'none'
  sort: 'newest' | 'oldest' | 'name' | 'name-desc'
  pinsFirst: boolean
  sectionOrder: string[]
}
export function defaultFeedView(): FeedView {
  return {
    query: '',
    filters: {},
    groupBy: 'workflow',
    sort: 'newest',
    pinsFirst: true,
    sectionOrder: [...workflowOrder],
  }
}

function facetValue(
  card: NeedsYouCardModel,
  facet: FeedFacet,
): { value: string; label: string } {
  const { session } = card
  switch (facet) {
    case 'status': {
      const label =
        card.attentionGroup === 'Waiting on you'
          ? session.attention === 'needs-approval'
            ? 'Needs approval'
            : 'Needs input'
          : session.attention === 'failed' || session.status === 'failed'
            ? 'Failed'
            : card.working
              ? session.status === 'running'
                ? 'Working'
                : 'Tasks running'
              : session.parallelWork?.unknown
                ? 'Tasks unknown'
                : session.attention === 'finished' ||
                    session.status === 'completed'
                  ? 'Finished'
                  : 'Idle'
      return { value: label, label }
    }
    case 'provider':
      return {
        value: session.providerId,
        label: resolveProviderIcon(session.providerId).label,
      }
    case 'model':
      return {
        value: session.model || '(unknown)',
        label: session.model || 'Model not recorded',
      }
    case 'project':
      return {
        value:
          session.contextKind === 'global'
            ? '(global)'
            : (session.projectId ?? '(unknown)'),
        label: card.projectName,
      }
    case 'host':
      return { value: session.executionHost ?? 'local', label: card.host }
    case 'kind':
      return {
        value: card.kind ?? '(unknown)',
        label:
          card.kind === 'resident'
            ? 'Resident'
            : card.kind === 'errand'
              ? 'Errand'
              : 'Type not recorded',
      }
    case 'pr': {
      const label = session.pullRequest
        ? pullRequestPresentation(session.pullRequest).label
        : 'No linked PR'
      return { value: label, label }
    }
  }
}

function matches(
  card: NeedsYouCardModel,
  view: FeedView,
  except?: FeedFacet,
): boolean {
  const query = view.query.trim().toLowerCase()
  if (
    query &&
    ![
      card.session.name,
      card.projectName,
      card.session.model,
      card.host,
      resolveProviderIcon(card.session.providerId).label,
      card.session.pullRequest
        ? `#${card.session.pullRequest.number} ${card.session.pullRequest.title ?? ''}`
        : '',
    ]
      .join(' ')
      .toLowerCase()
      .includes(query)
  )
    return false
  return (Object.keys(feedFacets) as FeedFacet[]).every(
    (facet) =>
      facet === except ||
      !view.filters[facet]?.length ||
      view.filters[facet]!.includes(facetValue(card, facet).value),
  )
}

export function buildFeedView(source: FeedGroup[], view: FeedView) {
  const cards = [
    ...new Map(
      source
        .flatMap((group) => group.cards)
        .map((card) => [card.session.id, card]),
    ).values(),
  ]
  const options = Object.fromEntries(
    (Object.keys(feedFacets) as FeedFacet[]).map((facet) => {
      const values = new Map<
        string,
        { value: string; label: string; count: number }
      >()
      for (const card of cards) {
        const item = facetValue(card, facet)
        const value = values.get(item.value) ?? { ...item, count: 0 }
        if (matches(card, view, facet)) value.count++
        values.set(item.value, value)
      }
      for (const selected of view.filters[facet] ?? []) {
        if (!values.has(selected))
          values.set(selected, { value: selected, label: selected, count: 0 })
      }
      return [
        facet,
        [...values.values()].sort((a, b) => a.label.localeCompare(b.label)),
      ]
    }),
  ) as Record<FeedFacet, { value: string; label: string; count: number }[]>
  const matched = cards.filter((card) => matches(card, view))
  const originalGroup = new Map(
    source.flatMap((group) =>
      group.cards.map((card) => [card.session.id, group.title] as const),
    ),
  )
  const buckets = new Map<string, NeedsYouCardModel[]>()
  for (const card of matched) {
    const workflow =
      card.attentionGroup && !card.dismissed
        ? card.attentionGroup
        : card.working
          ? 'Working'
          : card.kind === 'errand' && card.session.pullRequest
            ? 'Errands with a PR'
            : 'Other'
    const title =
      view.pinsFirst && card.session.pinnedAt
        ? 'Pinned'
        : view.groupBy === 'status'
          ? facetValue(card, 'status').label
          : view.groupBy === 'project'
            ? card.projectName
            : view.groupBy === 'none'
              ? 'Conversations'
              : originalGroup.get(card.session.id) === 'Pinned'
                ? workflow
                : (originalGroup.get(card.session.id) ?? workflow)
    const bucket = buckets.get(title) ?? []
    bucket.push(card)
    buckets.set(title, bucket)
  }
  const rank = (title: string) =>
    title === 'Pinned' && view.pinsFirst
      ? -1
      : view.sectionOrder.includes(title)
        ? view.sectionOrder.indexOf(title)
        : view.sectionOrder.length
  const groups = [...buckets]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([title, groupCards]) => ({
      title,
      cards: groupCards.sort((a, b) => {
        const order =
          view.sort === 'name' || view.sort === 'name-desc'
            ? a.session.name.localeCompare(b.session.name)
            : a.session.updatedAt.localeCompare(b.session.updatedAt)
        return (
          order *
            (view.sort === 'newest' || view.sort === 'name-desc' ? -1 : 1) ||
          a.session.id.localeCompare(b.session.id)
        )
      }),
    }))
  return {
    groups,
    options,
    total: cards.length,
    shown: matched.length,
    hiddenPins: cards.filter(
      (card) => card.session.pinnedAt && !matches(card, view),
    ).length,
  }
}

/** Restore only recognised preferences; a stale or malformed cache cannot hide the feed. */
export function readFeedView(raw: string | null): FeedView {
  const fallback = defaultFeedView()
  if (!raw) return fallback
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return fallback
    const item = value as Record<string, unknown>
    const filters: FeedView['filters'] = {}
    if (item.filters && typeof item.filters === 'object') {
      for (const facet of Object.keys(feedFacets) as FeedFacet[]) {
        const choices = (item.filters as Record<string, unknown>)[facet]
        if (
          Array.isArray(choices) &&
          choices.every((v) => typeof v === 'string')
        )
          filters[facet] = [...new Set(choices)]
      }
    }
    return {
      query: typeof item.query === 'string' ? item.query : '',
      filters,
      groupBy: ['workflow', 'status', 'project', 'none'].includes(
        String(item.groupBy),
      )
        ? (item.groupBy as FeedView['groupBy'])
        : fallback.groupBy,
      sort: ['newest', 'oldest', 'name', 'name-desc'].includes(
        String(item.sort),
      )
        ? (item.sort as FeedView['sort'])
        : fallback.sort,
      pinsFirst: typeof item.pinsFirst === 'boolean' ? item.pinsFirst : true,
      sectionOrder:
        Array.isArray(item.sectionOrder) &&
        item.sectionOrder.every((v) => typeof v === 'string')
          ? [...new Set(item.sectionOrder)]
          : fallback.sectionOrder,
    }
  } catch {
    return fallback
  }
}

/** Keep surviving cards under the pointer in place; status, membership and new arrivals remain current. */
export function holdFeedOrder(
  current: FeedGroup[],
  previous: FeedGroup[] | null,
): FeedGroup[] {
  if (!previous) return current
  const groupOrder = new Map(
    previous.map((group, index) => [group.title, index]),
  )
  return current
    .map((group) => {
      const positions = new Map(
        previous
          .find((old) => old.title === group.title)
          ?.cards.map((card, index) => [card.session.id, index]) ?? [],
      )
      return {
        ...group,
        cards: [...group.cards].sort(
          (a, b) =>
            (positions.get(a.session.id) ?? positions.size) -
            (positions.get(b.session.id) ?? positions.size),
        ),
      }
    })
    .sort(
      (a, b) =>
        (groupOrder.get(a.title) ?? groupOrder.size) -
        (groupOrder.get(b.title) ?? groupOrder.size),
    )
}

export function feedOrderKey(groups: FeedGroup[]): string {
  return JSON.stringify(
    groups.map((group) => [
      group.title,
      group.cards.map((card) => card.session.id),
    ]),
  )
}
