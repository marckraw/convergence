import type {
  CodeReviewCacheIdentity,
  CodeReviewFileEntry,
  CodeReviewMode,
  CodeReviewTarget,
} from '@/entities/code-review'

export type CodeReviewGuideRiskLevel = 'low' | 'medium' | 'high'
export type CodeReviewGuideStatus = 'ready' | 'failed'
export type CodeReviewGuideGenerator = 'deterministic' | 'agent'

export interface CodeReviewGuideFile {
  path: string
  status: CodeReviewFileEntry['status']
  reason: string
  hunkHints: string[]
}

export interface CodeReviewGuideSection {
  id: string
  title: string
  summary: string
  narrative: string
  riskLevel: CodeReviewGuideRiskLevel
  riskRationale: string
  checklist: string[]
  files: CodeReviewGuideFile[]
}

export interface CodeReviewGuideContent {
  overview: string
  generatedBy: CodeReviewGuideGenerator
  sections: CodeReviewGuideSection[]
}

export interface CodeReviewGuide extends CodeReviewGuideContent {
  id: string
  projectId: string
  targetId: string
  mode: CodeReviewMode
  cacheIdentity: CodeReviewCacheIdentity
  status: CodeReviewGuideStatus
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface CodeReviewGuideLookupRequest {
  target: CodeReviewTarget
  mode: CodeReviewMode
  cacheIdentity: CodeReviewCacheIdentity
}

export interface CodeReviewGuideGenerateRequest extends CodeReviewGuideLookupRequest {
  files: CodeReviewFileEntry[]
}

export type RemoteCodeReviewDaemonConnectionState =
  | 'connected'
  | 'missing-base-url'
  | 'invalid-base-url'
  | 'missing-token'
  | 'auth-failed'
  | 'unreachable'
  | 'invalid-response'
  | 'daemon-error'

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

export interface RemoteCodeReviewDaemonConnectionResult {
  ok: boolean
  state: RemoteCodeReviewDaemonConnectionState
  baseUrl: string | null
  message: string
  health: RemoteCodeReviewDaemonHealth | null
  meta: RemoteCodeReviewDaemonMeta | null
}
