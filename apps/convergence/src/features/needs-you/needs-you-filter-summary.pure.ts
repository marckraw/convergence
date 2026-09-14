import { resolveProviderIcon } from '@/shared/ui/provider-icon.pure'
import {
  activityViews,
  type ActivityView,
  type FeedView,
} from './needs-you-view.pure'
import { feedOrderLabels } from './needs-you-order.pure'

export const activityViewLabels: Record<ActivityView, string> = {
  all: 'All activity',
  'needs-me': 'Needs me',
  working: 'Working',
  review: 'Review',
}

/** Describe selected rules even when their matching activity disappears. */
export function buildFeedFilterSummary(view: FeedView) {
  const hosts = view.hosts.length
    ? [
        ...(view.hosts.includes('local') ? ['Local'] : []),
        ...(view.hosts.includes('remote') ? ['Remote'] : []),
      ].join(' + ')
    : 'All hosts'
  const providers = view.providers.length
    ? view.providers
        .map((provider) => resolveProviderIcon(provider).label)
        .sort((a, b) => a.localeCompare(b))
        .join(' + ')
    : 'All providers'
  return {
    activity: view.activities.length
      ? activityViews
          .filter(
            (activity) =>
              activity !== 'all' && view.activities.includes(activity),
          )
          .map((activity) => activityViewLabels[activity])
          .join(' + ')
      : activityViewLabels.all,
    scope: `${hosts} · ${providers}`,
    order: feedOrderLabels[view.order].summary,
  }
}
