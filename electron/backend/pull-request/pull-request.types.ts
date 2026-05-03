import type { WorkspacePullRequestRow } from '../database/database.types'

export type PullRequestProvider = 'github' | 'unknown'

export type PullRequestLookupStatus =
  | 'found'
  | 'not-found'
  | 'unsupported-remote'
  | 'gh-unavailable'
  | 'gh-auth-required'
  | 'error'

export type PullRequestState =
  | 'none'
  | 'open'
  | 'draft'
  | 'closed'
  | 'merged'
  | 'unknown'

export interface WorkspacePullRequest {
  id: string
  projectId: string
  workspaceId: string
  provider: PullRequestProvider
  lookupStatus: PullRequestLookupStatus
  state: PullRequestState
  repositoryOwner: string | null
  repositoryName: string | null
  number: number | null
  title: string | null
  url: string | null
  isDraft: boolean
  headBranch: string | null
  baseBranch: string | null
  mergedAt: string | null
  lastCheckedAt: string
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface GithubRepositoryRef {
  owner: string
  name: string
}

export interface GithubCliPullRequestJson {
  number?: number
  title?: string
  url?: string
  state?: string
  isDraft?: boolean
  mergedAt?: string | null
  headRefName?: string
  baseRefName?: string
}

export interface PullRequestLookupResult {
  provider: PullRequestProvider
  lookupStatus: PullRequestLookupStatus
  state: PullRequestState
  repositoryOwner: string | null
  repositoryName: string | null
  number: number | null
  title: string | null
  url: string | null
  isDraft: boolean
  headBranch: string | null
  baseBranch: string | null
  mergedAt: string | null
  error: string | null
}

export function workspacePullRequestFromRow(
  row: WorkspacePullRequestRow,
): WorkspacePullRequest {
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    provider: parseProvider(row.provider),
    lookupStatus: parseLookupStatus(row.lookup_status),
    state: parseState(row.state),
    repositoryOwner: row.repository_owner,
    repositoryName: row.repository_name,
    number: row.number,
    title: row.title,
    url: row.url,
    isDraft: row.is_draft === 1,
    headBranch: row.head_branch,
    baseBranch: row.base_branch,
    mergedAt: row.merged_at,
    lastCheckedAt: row.last_checked_at,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseProvider(value: string): PullRequestProvider {
  return value === 'github' ? 'github' : 'unknown'
}

function parseLookupStatus(value: string): PullRequestLookupStatus {
  if (
    value === 'found' ||
    value === 'not-found' ||
    value === 'unsupported-remote' ||
    value === 'gh-unavailable' ||
    value === 'gh-auth-required' ||
    value === 'error'
  ) {
    return value
  }
  return 'error'
}

function parseState(value: string): PullRequestState {
  if (
    value === 'none' ||
    value === 'open' ||
    value === 'draft' ||
    value === 'closed' ||
    value === 'merged' ||
    value === 'unknown'
  ) {
    return value
  }
  return 'unknown'
}
