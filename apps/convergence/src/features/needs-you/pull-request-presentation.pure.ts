import type { SessionPullRequest } from '@/shared/types/session-pull-request.types'

export function pullRequestPresentation(pr: SessionPullRequest) {
  const state =
    pr.state !== 'open'
      ? pr.state
      : pr.reviewDecision === 'CHANGES_REQUESTED'
        ? 'changes-requested'
        : pr.reviewDecision === 'APPROVED'
          ? 'approved'
          : 'ready'
  const label = {
    draft: 'Draft',
    ready: 'Ready for review',
    'changes-requested': 'Changes requested',
    approved: 'Approved',
    merged: 'Merged',
    closed: 'Closed',
  }[state]
  // Persisted links are still untrusted input at the renderer boundary.
  let href: string | null = null
  try {
    const url = new URL(pr.url)
    if (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      !url.username &&
      !url.password &&
      /^\/[^/]+\/[^/]+\/pull\/\d+\/?$/.test(url.pathname)
    )
      href = url.href
  } catch {
    /* An invalid link remains readable metadata. */
  }
  return {
    state,
    label,
    href,
    tooltip: [
      `Pull request #${pr.number}: ${label}`,
      pr.title,
      `Last checked: ${pr.checkedAt}`,
    ]
      .filter(Boolean)
      .join('\n'),
  }
}
