import type { UpsertWorkboardTrackerIssueInput } from '../workboard.types'
import {
  readConfigString,
  readConfigStringArray,
  requireConfigString,
} from './tracker-config.pure'
import type {
  WorkboardFetcher,
  WorkboardTrackerProvider,
} from './tracker.types'

interface LinearIssueNode {
  id?: unknown
  identifier?: unknown
  title?: unknown
  description?: unknown
  url?: unknown
  priorityLabel?: unknown
  updatedAt?: unknown
  state?: { name?: unknown }
  assignee?: { name?: unknown }
  labels?: { nodes?: Array<{ name?: unknown }> }
}

interface LinearIssuesResponse {
  data?: {
    issues?: {
      nodes?: LinearIssueNode[]
    }
  }
  errors?: Array<{ message?: unknown }>
}

const LINEAR_QUERY = `
  query WorkboardIssues($filter: IssueFilter, $first: Int!) {
    issues(filter: $filter, first: $first) {
      nodes {
        id
        identifier
        title
        description
        url
        priorityLabel
        updatedAt
        state { name }
        assignee { name }
        labels { nodes { name } }
      }
    }
  }
`

function defaultFetch(): WorkboardFetcher {
  const fetcher = (globalThis as { fetch?: WorkboardFetcher }).fetch
  if (!fetcher) {
    throw new Error('This runtime does not provide fetch for Linear sync')
  }
  return fetcher
}

function buildLinearFilter(
  sync: Record<string, unknown>,
): Record<string, unknown> {
  const labelNames = readConfigStringArray(sync, {}, 'labels')
  const teamKey = readConfigString(sync, {}, 'teamKey')
  const projectName = readConfigString(sync, {}, 'projectName')
  const filter: Record<string, unknown> = {}

  if (labelNames.length > 0) {
    filter.labels = {
      some: {
        name: {
          in: labelNames,
        },
      },
    }
  }

  if (teamKey) {
    filter.team = {
      key: {
        eq: teamKey,
      },
    }
  }

  if (projectName) {
    filter.project = {
      name: {
        eq: projectName,
      },
    }
  }

  return filter
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export class LinearWorkboardProvider implements WorkboardTrackerProvider {
  readonly type = 'linear' as const

  constructor(private fetcher: WorkboardFetcher = defaultFetch()) {}

  async syncSource(
    source: Parameters<WorkboardTrackerProvider['syncSource']>[0],
  ): Promise<UpsertWorkboardTrackerIssueInput[]> {
    const token = requireConfigString(
      source.name,
      source.auth,
      source.sync,
      'token',
    )
    const firstRaw = readConfigString(source.sync, {}, 'first')
    const first = firstRaw ? Number.parseInt(firstRaw, 10) : 50
    const response = await this.fetcher('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: LINEAR_QUERY,
        variables: {
          first: Number.isFinite(first) ? first : 50,
          filter: buildLinearFilter(source.sync),
        },
      }),
    })

    if (!response.ok) {
      throw new Error(
        `Linear sync failed for ${source.name}: ${response.status} ${response.statusText}`,
      )
    }

    const parsed = (await response.json()) as LinearIssuesResponse
    const errors = parsed.errors ?? []
    if (errors.length > 0) {
      const message = stringValue(errors[0]?.message) || 'Unknown Linear error'
      throw new Error(`Linear sync failed for ${source.name}: ${message}`)
    }

    const nodes = parsed.data?.issues?.nodes ?? []
    return nodes
      .filter((node) => typeof node.id === 'string')
      .map((node) => ({
        sourceId: source.id,
        externalId: stringValue(node.id),
        externalKey: stringValue(node.identifier),
        url: stringValue(node.url),
        title: stringValue(node.title),
        body: stringValue(node.description),
        labels:
          node.labels?.nodes
            ?.map((label) => stringValue(label.name))
            .filter(Boolean) ?? [],
        status: stringValue(node.state?.name),
        priority: stringValue(node.priorityLabel) || null,
        assignee: stringValue(node.assignee?.name) || null,
        updatedAtExternal: stringValue(node.updatedAt) || null,
        raw: {
          ...(node as Record<string, unknown>),
          teamKey: readConfigString(source.sync, {}, 'teamKey'),
          projectName: readConfigString(source.sync, {}, 'projectName'),
        },
      }))
  }
}
