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
