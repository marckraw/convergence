import {
  classifyLinearReply,
  LINEAR_GRAPHQL_URL,
  LINEAR_MAX_PAGES,
  linearLabeledIssuesRequest,
  parseLinearIssuesPage,
} from './linear-tracker.pure'
import {
  TrackerRefusalError,
  type ListLabeledIssuesInput,
  type TrackerAdapter,
  type TrackerBinding,
  type TrackerIssue,
  type TrackerProbe,
} from './tracker.types'

export type TrackerFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<{
  status: number
  headers: { get(name: string): string | null }
  json(): Promise<unknown>
}>

const REQUEST_TIMEOUT_MS = 20_000

/**
 * The Linear adapter (MAR-3084 R1/R2): GraphQL over `fetch`, read-only.
 *
 * Every failure leaves as a `TrackerRefusalError` carrying a typed refusal --
 * a network refusal, a refused key, a rate limit, a body that is not a page --
 * so the watcher reads a kind and never a message. The key is sent as
 * Linear's personal-key header (`Authorization: <key>`, no Bearer) and never
 * appears in a refusal.
 */
export function createLinearTrackerAdapter(deps: {
  apiKey: string
  binding: TrackerBinding
  fetch?: TrackerFetch
  now?: () => Date
}): TrackerAdapter {
  const doFetch: TrackerFetch =
    deps.fetch ??
    ((url, init) =>
      fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }))
  const now = deps.now ?? (() => new Date())

  async function readPage(
    input: ListLabeledIssuesInput,
    after: string | null,
  ): Promise<{ issues: TrackerIssue[]; next: string | null }> {
    let reply: Awaited<ReturnType<TrackerFetch>>
    try {
      reply = await doFetch(LINEAR_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: deps.apiKey,
        },
        body: JSON.stringify(
          linearLabeledIssuesRequest({
            projectId: input.projectId,
            labelPrefix: input.labelPrefix,
            after,
          }),
        ),
      })
    } catch {
      throw new TrackerRefusalError({
        kind: 'unreachable',
        message: 'Linear could not be reached.',
        retryAt: null,
      })
    }

    let body: unknown
    try {
      body = await reply.json()
    } catch {
      body = null
    }

    const refusal = classifyLinearReply({
      status: reply.status,
      headers: reply.headers,
      body,
      now: now(),
    })
    if (refusal) throw new TrackerRefusalError(refusal)

    const read = parseLinearIssuesPage(body, {
      labelPrefix: input.labelPrefix,
      wavePrefix: input.wavePrefix,
      statusMap: deps.binding.statusMap,
    })
    if (!read.ok) throw new TrackerRefusalError(read.refusal)
    return {
      issues: read.page.issues,
      next: read.page.hasNextPage ? read.page.endCursor : null,
    }
  }

  async function listLabeledIssues(
    input: ListLabeledIssuesInput,
  ): Promise<TrackerIssue[]> {
    const issues: TrackerIssue[] = []
    let after: string | null = null
    for (let page = 0; page < LINEAR_MAX_PAGES; page += 1) {
      const read = await readPage(input, after)
      issues.push(...read.issues)
      if (read.next === null) return issues
      after = read.next
    }
    // A partial list would read as issues that lost their labels.
    throw new TrackerRefusalError({
      kind: 'bad-response',
      message: `Linear kept paging past ${LINEAR_MAX_PAGES} pages.`,
      retryAt: null,
    })
  }

  return {
    listLabeledIssues,
    async probe(): Promise<TrackerProbe> {
      try {
        const issues = await listLabeledIssues({
          projectId: deps.binding.projectId,
          labelPrefix: deps.binding.labelPrefix,
          wavePrefix: deps.binding.wavePrefix,
        })
        return { ok: true, issues: issues.length }
      } catch (error) {
        if (error instanceof TrackerRefusalError) {
          return { ok: false, refusal: error.refusal }
        }
        return {
          ok: false,
          refusal: {
            kind: 'bad-response',
            message: 'Linear answered something this app could not read.',
            retryAt: null,
          },
        }
      }
    },
  }
}
