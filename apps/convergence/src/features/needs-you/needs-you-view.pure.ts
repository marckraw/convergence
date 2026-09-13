import { isLocalExecutionHost } from '@/entities/execution-host'
import { resolveProviderIcon } from '@/shared/ui/provider-icon.pure'
import type { NeedsYouCardModel } from './needs-you-card.pure'

export const activityViews = ['all', 'needs-me', 'working', 'review'] as const
export type ActivityView = (typeof activityViews)[number]
export type FeedHost = 'local' | 'remote'
export type FeedGroup = { title: string; cards: NeedsYouCardModel[] }
export interface FeedView {
  version: 2
  activity: ActivityView
  hosts: FeedHost[]
  providers: string[]
}
export function defaultFeedView(): FeedView {
  return { version: 2, activity: 'all', hosts: [], providers: [] }
}

function providerValue(card: NeedsYouCardModel): string {
  const id = card.session.providerId
  return resolveProviderIcon(id).brand ?? id
}
function hostValue(card: NeedsYouCardModel): FeedHost {
  return isLocalExecutionHost(card.session.executionHost) ? 'local' : 'remote'
}
/** Interpret attention without promoting unknown or acknowledged work to an action. */
function activityValue(
  card: NeedsYouCardModel,
): Exclude<ActivityView, 'all'> | null {
  if (
    !card.dismissed &&
    (card.attentionGroup === 'Waiting on you' ||
      card.session.attention === 'failed' ||
      card.session.status === 'failed')
  )
    return 'needs-me'
  if (card.working) return 'working'
  if (!card.dismissed && card.attentionGroup === 'Needs review') return 'review'
  return null
}
function matches(
  card: NeedsYouCardModel,
  view: FeedView,
  except?: 'activity' | 'hosts' | 'providers',
): boolean {
  return (
    (except === 'activity' ||
      view.activity === 'all' ||
      activityValue(card) === view.activity) &&
    (except === 'hosts' ||
      !view.hosts.length ||
      view.hosts.includes(hostValue(card))) &&
    (except === 'providers' ||
      !view.providers.length ||
      view.providers.includes(providerValue(card)))
  )
}
export function toggleFeedChoice<T extends string>(
  selected: T[],
  value: T,
): T[] {
  return selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value]
}
export function buildFeedView(source: FeedGroup[], view: FeedView) {
  const cards = [
    ...new Map(
      source
        .flatMap((group) => group.cards)
        .map((card) => [card.session.id, card]),
    ).values(),
  ]
  const activityCounts = Object.fromEntries(
    activityViews.map((value) => [
      value,
      cards.filter(
        (card) =>
          matches(card, view, 'activity') &&
          (value === 'all' || activityValue(card) === value),
      ).length,
    ]),
  ) as Record<ActivityView, number>
  const hostCounts = Object.fromEntries(
    (['local', 'remote'] as const).map((value) => [
      value,
      cards.filter(
        (card) => matches(card, view, 'hosts') && hostValue(card) === value,
      ).length,
    ]),
  ) as Record<FeedHost, number>
  // Derive options before filtering, retaining saved choices so they can be cleared.
  const providers = [
    ...new Set([...cards.map(providerValue), ...view.providers]),
  ]
    .map((value) => ({
      value,
      label: resolveProviderIcon(value).label,
      count: cards.filter(
        (card) =>
          matches(card, view, 'providers') && providerValue(card) === value,
      ).length,
    }))
    .sort(
      (a, b) =>
        a.label.localeCompare(b.label) || a.value.localeCompare(b.value),
    )
  const matched = cards.filter((card) => matches(card, view))
  const originalGroup = new Map(
    source.flatMap((group) =>
      group.cards.map((card) => [card.session.id, group.title]),
    ),
  )
  const buckets = new Map<string, NeedsYouCardModel[]>()
  for (const card of matched) {
    const activity = activityValue(card)
    const title = card.session.pinnedAt
      ? 'Pinned'
      : activity === 'needs-me'
        ? 'Needs attention'
        : activity === 'working'
          ? 'Working'
          : activity === 'review'
            ? 'Review'
            : (originalGroup.get(card.session.id) ?? 'Other')
    const bucket = buckets.get(title) ?? []
    bucket.push(card)
    buckets.set(title, bucket)
  }
  const order = [
    'Pinned',
    'Needs attention',
    'Working',
    'Review',
    'Errands with a PR',
  ]
  const rank = (title: string) =>
    order.includes(title) ? order.indexOf(title) : order.length
  const groups = [...buckets]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([title, groupCards]) => ({
      title,
      cards: groupCards.sort(
        (a, b) =>
          b.session.updatedAt.localeCompare(a.session.updatedAt) ||
          a.session.id.localeCompare(b.session.id),
      ),
    }))
  return {
    groups,
    activityCounts,
    hostCounts,
    providers,
    filtered:
      view.activity !== 'all' ||
      view.hosts.length > 0 ||
      view.providers.length > 0,
    total: cards.length,
    shown: matched.length,
    hiddenPins: cards.filter(
      (card) => card.session.pinnedAt && !matches(card, view),
    ).length,
  }
}
/** Old advanced views reset: no invisible search, project filter or custom order survives. */
export function readFeedView(raw: string | null): FeedView {
  const fallback = defaultFeedView()
  if (!raw) return fallback
  try {
    const item: unknown = JSON.parse(raw)
    if (
      !item ||
      typeof item !== 'object' ||
      !('version' in item) ||
      item.version !== 2
    )
      return fallback
    const value = item as Record<string, unknown>
    return {
      version: 2,
      activity: activityViews.includes(value.activity as ActivityView)
        ? (value.activity as ActivityView)
        : 'all',
      hosts: Array.isArray(value.hosts)
        ? [
            ...new Set(
              value.hosts.filter(
                (host): host is FeedHost =>
                  host === 'local' || host === 'remote',
              ),
            ),
          ]
        : [],
      providers: Array.isArray(value.providers)
        ? [
            ...new Set(
              value.providers.filter(
                (id): id is string =>
                  typeof id === 'string' && id.trim().length > 0,
              ),
            ),
          ]
        : [],
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
