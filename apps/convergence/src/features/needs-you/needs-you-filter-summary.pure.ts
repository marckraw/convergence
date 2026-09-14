import { resolveProviderIcon } from '@/shared/ui/provider-icon.pure'
import type { ActivityView, FeedView } from './needs-you-view.pure'

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
    activity: activityViewLabels[view.activity],
    scope: `${hosts} · ${providers}`,
  }
}
