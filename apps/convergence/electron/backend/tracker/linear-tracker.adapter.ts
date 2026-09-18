import {
  classifyLinearReply,
  LINEAR_GRAPHQL_URL,
  LINEAR_MAX_PAGES,
  linearLabeledIssuesRequest,
  linearProjectLookupRequest,
  parseLinearIssuesPage,
  parseLinearProjectsReply,
  type LinearProject,
} from './linear-tracker.pure'
import {
  parseLinearProjectReference,
  type LinearProjectReference,
} from '../../../src/shared/lib/linear-project-reference.pure'
import {
  TrackerRefusalError,
  type ListLabeledIssuesInput,
  type TrackerAdapter,
  type TrackerBinding,
  type TrackerIssue,
  type TrackerProbe,
  type TrackerProjectResolution,
  type TrackerRefusal,
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

  /**
   * One POST, and a readable body or a typed refusal.
   *
   * Both reads go through here (MAR-3156): the key's header, the network's
   * silence and Linear's own refusals are one story, told once, so a second
   * read cannot learn a different set of manners.
   */
  async function ask(request: {
    query: string
    variables: Record<string, unknown>
  }): Promise<unknown> {
    let reply: Awaited<ReturnType<TrackerFetch>>
    try {
      reply = await doFetch(LINEAR_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: deps.apiKey,
        },
        body: JSON.stringify(request),
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
    return body
  }

  async function readPage(
    input: ListLabeledIssuesInput,
    after: string | null,
  ): Promise<{ issues: TrackerIssue[]; next: string | null }> {
    const body = await ask(
      linearLabeledIssuesRequest({
        projectId: input.projectId,
        labelPrefix: input.labelPrefix,
        after,
      }),
    )

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

  /** The projects answering to one reference; a refusal leaves as a throw. */
  async function findProjects(
    reference: LinearProjectReference,
  ): Promise<LinearProject[]> {
    const body = await ask(linearProjectLookupRequest(reference))
    const read = parseLinearProjectsReply(body)
    if (!read.ok) throw new TrackerRefusalError(read.refusal)
    return read.projects
  }

  function asRefusal(error: unknown): TrackerRefusal {
    return error instanceof TrackerRefusalError
      ? error.refusal
      : {
          kind: 'bad-response',
          message: 'Linear answered something this app could not read.',
          retryAt: null,
        }
  }

  async function resolveProject(
    reference: string,
  ): Promise<TrackerProjectResolution> {
    const parsed = parseLinearProjectReference(reference)
    if (parsed === null) {
      return {
        kind: 'refused',
        refusal: {
          kind: 'bad-response',
          message: 'Type a project URL, a project name or its id.',
          retryAt: null,
        },
      }
    }
    try {
      const projects = await findProjects(parsed)
      // Never `nodes[0]` (R2): one project is an answer, several is a
      // question for the person, and binding the first would answer it on
      // their behalf -- silently, and wrongly half the time.
      if (projects.length === 0) return { kind: 'not-found' }
      if (projects.length > 1) {
        return { kind: 'ambiguous', candidates: projects }
      }
      return { kind: 'resolved', project: projects[0]! }
    } catch (error) {
      return { kind: 'refused', refusal: asRefusal(error) }
    }
  }

  return {
    listLabeledIssues,
    resolveProject,
    async probe(): Promise<TrackerProbe> {
      try {
        // What the key can actually see under the bound id, FIRST (R4): a
        // count for a project nobody can reach reads as a quiet project, and
        // that is the sentence this feature exists to stop telling.
        const [project] = await findProjects({
          kind: 'id',
          value: deps.binding.projectId,
        })
        if (!project) return { ok: true, issues: 0, projectName: null }
        const issues = await listLabeledIssues({
          projectId: deps.binding.projectId,
          labelPrefix: deps.binding.labelPrefix,
          wavePrefix: deps.binding.wavePrefix,
        })
        return { ok: true, issues: issues.length, projectName: project.name }
      } catch (error) {
        return { ok: false, refusal: asRefusal(error) }
      }
    },
  }
}
