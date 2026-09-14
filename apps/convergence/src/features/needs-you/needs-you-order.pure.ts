import type { NeedsYouCardModel } from './needs-you-card.pure'

export const feedOrders = ['created', 'updated', 'name'] as const
export type FeedOrder = (typeof feedOrders)[number]
export const feedOrderLabels: Record<
  FeedOrder,
  { label: string; summary: string; tooltip: string }
> = {
  created: {
    label: 'Created',
    summary: 'Created (newest first)',
    tooltip:
      'Newest conversations first within each group. Agent updates keep this order.',
  },
  updated: {
    label: 'Updated',
    summary: 'Updated (latest first)',
    tooltip:
      'Most recently updated first within each group. Cards move as agents work.',
  },
  name: {
    label: 'Name',
    summary: 'Name (A–Z)',
    tooltip:
      'Conversation names A–Z within each group. Agent updates keep this order.',
  },
}

function recordedTime(value: string): number {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : 0
}

export function sortFeedCards(
  cards: NeedsYouCardModel[],
  order: FeedOrder,
): NeedsYouCardModel[] {
  return [...cards].sort((a, b) => {
    const compared =
      order === 'name'
        ? a.session.name.localeCompare(b.session.name, undefined, {
            sensitivity: 'base',
            numeric: true,
          })
        : recordedTime(
            b.session[order === 'created' ? 'createdAt' : 'updatedAt'],
          ) -
          recordedTime(
            a.session[order === 'created' ? 'createdAt' : 'updatedAt'],
          )
    return compared || a.session.id.localeCompare(b.session.id)
  })
}
