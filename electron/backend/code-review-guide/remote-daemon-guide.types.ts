import type { CodeReviewCacheIdentity } from '../code-review/code-review.types'
import type {
  CodeReviewGuideDraft,
  CodeReviewGuideFile,
  CodeReviewGuideGenerator,
  CodeReviewGuideRiskLevel,
  CodeReviewGuideSection,
  CodeReviewGuideStatus,
} from './code-review-guide.types'

export type RemoteCodeReviewDaemonProviderId =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'gemini'

export type RemoteCodeReviewDaemonConnectionState =
  | 'connected'
  | 'missing-base-url'
  | 'invalid-base-url'
  | 'missing-token'
  | 'auth-failed'
  | 'unreachable'
  | 'invalid-response'
  | 'daemon-error'

export interface RemoteCodeReviewDaemonConnectionResult {
  ok: boolean
  state: RemoteCodeReviewDaemonConnectionState
  baseUrl: string | null
  message: string
  health: RemoteCodeReviewDaemonHealth | null
  meta: RemoteCodeReviewDaemonMeta | null
}

export interface RemoteCodeReviewDaemonHealth {
  status: 'ok'
  version: string
  apiVersion: string
  uptime: number
  activeSessions: number
  providers: Record<string, boolean>
}

export interface RemoteCodeReviewDaemonMeta {
  name: string
  version: string
  apiVersion: string
  deployment: {
    mode: string
    sharedAcrossTeams: boolean
  }
  providers: unknown[]
  git: {
    githubAuthenticated: boolean
  }
  runtime: {
    activeSessions: number
    maxConcurrentAgents: number
    uptimeSeconds: number
    host: string
    port: number
  }
}

export interface RemoteCodeReviewFileEntry {
  status: string
  file: string
  previousFile?: string
}

export interface RemotePullRequestMetadata {
  provider: 'github'
  repositoryOwner: string
  repositoryName: string
  number: number
  title: string | null
  url: string
  state: 'open' | 'closed' | 'merged' | 'unknown'
  baseBranch: string
  headBranch: string
  headRepositoryOwner: string | null
  headRepositoryName: string | null
}

export interface RemoteCodeReviewGuideSummary {
  cacheIdentity: CodeReviewCacheIdentity
  files: RemoteCodeReviewFileEntry[]
}

export interface RemoteCodeReviewGuide {
  id: string
  repository: string
  pullRequestNumber: number
  targetId: string
  mode: 'pull-request'
  cacheIdentity: CodeReviewCacheIdentity
  provider: RemoteCodeReviewDaemonProviderId
  model: string
  effort: string | null
  status: CodeReviewGuideStatus
  overview: string
  generatedBy: CodeReviewGuideGenerator
  sections: CodeReviewGuideSection[]
  error: string | null
  pullRequest: RemotePullRequestMetadata
  summary: RemoteCodeReviewGuideSummary
  createdAt: string
  updatedAt: string
}

export interface RemoteCodeReviewGuideGenerateInput {
  repository: string
  pullRequestNumber: number
  provider: RemoteCodeReviewDaemonProviderId
  model: string
  effort?: string | null
  force?: boolean
}

export interface RemoteCodeReviewGuideGenerateResult {
  pullRequest: RemotePullRequestMetadata
  summary: RemoteCodeReviewGuideSummary
  guide: RemoteCodeReviewGuide
  guideDraft: CodeReviewGuideDraft
}

export interface RemoteCodeReviewGuideRequestBody {
  source: {
    repository: string
    pullRequest: {
      number: number
    }
  }
  provider: RemoteCodeReviewDaemonProviderId
  model: string
  effort?: string
  force?: boolean
}

export type ParsedRemoteCodeReviewGuideFile = CodeReviewGuideFile
export type ParsedRemoteCodeReviewGuideRiskLevel = CodeReviewGuideRiskLevel
