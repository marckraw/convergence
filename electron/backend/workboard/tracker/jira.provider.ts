import type { UpsertWorkboardTrackerIssueInput } from '../workboard.types'
import { readConfigString, requireConfigString } from './tracker-config.pure'
import type {
  WorkboardFetcher,
  WorkboardTrackerProvider,
} from './tracker.types'

interface JiraIssue {
  id?: unknown
  key?: unknown
  self?: unknown
  fields?: {
    summary?: unknown
    description?: unknown
    labels?: unknown
    status?: { name?: unknown }
    priority?: { name?: unknown }
    assignee?: { displayName?: unknown }
    updated?: unknown
    components?: Array<{ name?: unknown }>
  }
}

interface JiraSearchResponse {
  issues?: JiraIssue[]
}

function defaultFetch(): WorkboardFetcher {
  const fetcher = (globalThis as { fetch?: WorkboardFetcher }).fetch
  if (!fetcher) {
    throw new Error('This runtime does not provide fetch for Jira sync')
  }
  return fetcher
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function normalizeSiteUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function encodeBasicAuth(email: string, apiToken: string): string {
  return Buffer.from(`${email}:${apiToken}`).toString('base64')
}

export class JiraWorkboardProvider implements WorkboardTrackerProvider {
  readonly type = 'jira' as const

  constructor(private fetcher: WorkboardFetcher = defaultFetch()) {}

  async syncSource(
    source: Parameters<WorkboardTrackerProvider['syncSource']>[0],
  ): Promise<UpsertWorkboardTrackerIssueInput[]> {
    const siteUrl = normalizeSiteUrl(
      requireConfigString(source.name, source.auth, source.sync, 'siteUrl'),
    )
    const email = requireConfigString(
      source.name,
      source.auth,
      source.sync,
      'email',
    )
    const apiToken = requireConfigString(
      source.name,
      source.auth,
      source.sync,
      'apiToken',
    )
    const jql =
      readConfigString(source.sync, source.auth, 'jql') ??
      'labels = convergence-loop ORDER BY updated DESC'
    const maxResults =
      Number.parseInt(
        readConfigString(source.sync, source.auth, 'maxResults') ?? '50',
        10,
      ) || 50
    const url = new URL(`${siteUrl}/rest/api/3/search`)
    url.searchParams.set('jql', jql)
    url.searchParams.set('maxResults', String(maxResults))
    url.searchParams.set(
      'fields',
      [
        'summary',
        'description',
        'labels',
        'status',
        'priority',
        'assignee',
        'updated',
        'components',
      ].join(','),
    )

    const response = await this.fetcher(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Basic ${encodeBasicAuth(email, apiToken)}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(
        `Jira sync failed for ${source.name}: ${response.status} ${response.statusText}`,
      )
    }

    const parsed = (await response.json()) as JiraSearchResponse
    return (parsed.issues ?? [])
      .filter((issue) => typeof issue.id === 'string')
      .map((issue) => {
        const fields = issue.fields ?? {}
        const key = stringValue(issue.key)
        return {
          sourceId: source.id,
          externalId: stringValue(issue.id),
          externalKey: key,
          url: key ? `${siteUrl}/browse/${key}` : stringValue(issue.self),
          title: stringValue(fields.summary),
          body:
            typeof fields.description === 'string'
              ? fields.description
              : JSON.stringify(fields.description ?? ''),
          labels: stringArrayValue(fields.labels),
          status: stringValue(fields.status?.name),
          priority: stringValue(fields.priority?.name) || null,
          assignee: stringValue(fields.assignee?.displayName) || null,
          updatedAtExternal: stringValue(fields.updated) || null,
          raw: {
            ...(issue as Record<string, unknown>),
            projectKey: key.split('-')[0] ?? '',
            components:
              fields.components
                ?.map((component) => stringValue(component.name))
                .filter(Boolean) ?? [],
          },
        }
      })
  }
}
