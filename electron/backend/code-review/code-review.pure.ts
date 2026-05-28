import type { CodeReviewTarget } from './code-review.types'

export function prioritizeTargets<
  T extends Pick<CodeReviewTarget, 'sessionId'>,
>(targets: T[], sessionId: string | null): T[] {
  if (!sessionId) return targets
  return [...targets].sort((a, b) => {
    const aFocused = a.sessionId === sessionId
    const bFocused = b.sessionId === sessionId
    if (aFocused === bFocused) return 0
    return aFocused ? -1 : 1
  })
}

export function formatPullRequestLabel(input: {
  number: number | null
  title: string | null
  state: string
}): string {
  const prefix = input.number ? `#${input.number}` : 'Pull Request'
  const title = input.title ? ` ${input.title}` : ''
  return `${prefix}${title} · ${input.state}`
}
