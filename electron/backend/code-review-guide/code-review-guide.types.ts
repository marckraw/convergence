import type { ChangedFileEntry } from '../git/changed-files.types'
import type {
  CodeReviewCacheIdentity,
  CodeReviewMode,
  CodeReviewTarget,
} from '../code-review/code-review.types'
import type { CodeReviewGuideRow } from '../database/database.types'

export type CodeReviewGuideRiskLevel = 'low' | 'medium' | 'high'
export type CodeReviewGuideStatus = 'ready' | 'failed'
export type CodeReviewGuideGenerator = 'deterministic' | 'agent'

export interface CodeReviewGuideFile {
  path: string
  status: ChangedFileEntry['status']
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

export interface CodeReviewGuide {
  id: string
  projectId: string
  targetId: string
  mode: CodeReviewMode
  cacheIdentity: CodeReviewCacheIdentity
  status: CodeReviewGuideStatus
  overview: string
  generatedBy: CodeReviewGuideGenerator
  sections: CodeReviewGuideSection[]
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
  files: ChangedFileEntry[]
}

export interface CodeReviewGuideDraft {
  overview: string
  generatedBy: CodeReviewGuideGenerator
  sections: CodeReviewGuideSection[]
}

export interface CodeReviewGuidePromptPatch {
  filePath: string
  status: string
  diffExcerpt: string
  truncated: boolean
}

export interface CodeReviewGuidePromptInput {
  target: CodeReviewTarget
  mode: CodeReviewMode
  files: ChangedFileEntry[]
  patches: CodeReviewGuidePromptPatch[]
}

export type CodeReviewGuideValidationResult =
  | { ok: true; value: CodeReviewGuideDraft }
  | {
      ok: false
      error: { kind: 'parse' | 'schema'; message: string; field?: string }
    }

export function codeReviewGuideFromRow(
  row: CodeReviewGuideRow,
): CodeReviewGuide {
  return {
    id: row.id,
    projectId: row.project_id,
    targetId: row.target_id,
    mode: parseCodeReviewGuideMode(row.mode),
    cacheIdentity: parseCacheIdentity(row.cache_identity_json),
    status: parseCodeReviewGuideStatus(row.status),
    overview: row.overview,
    generatedBy: parseCodeReviewGuideGenerator(row.generated_by),
    sections: parseSections(row.sections_json),
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseCodeReviewGuideMode(value: string): CodeReviewMode {
  if (value === 'working-tree' || value === 'base-branch') return value
  throw new Error(`Invalid code review guide mode: ${value}`)
}

function parseCodeReviewGuideStatus(value: string): CodeReviewGuideStatus {
  if (value === 'ready' || value === 'failed') return value
  throw new Error(`Invalid code review guide status: ${value}`)
}

function parseCodeReviewGuideGenerator(
  value: string,
): CodeReviewGuideGenerator {
  if (value === 'deterministic' || value === 'agent') return value
  throw new Error(`Invalid code review guide generator: ${value}`)
}

function parseCacheIdentity(value: string): CodeReviewCacheIdentity {
  const parsed = JSON.parse(value) as CodeReviewCacheIdentity
  if (
    (typeof parsed.comparisonRef !== 'string' &&
      parsed.comparisonRef !== null) ||
    (typeof parsed.comparisonPoint !== 'string' &&
      parsed.comparisonPoint !== null) ||
    typeof parsed.workingTreeVersionToken !== 'string'
  ) {
    throw new Error('Invalid code review guide cache identity')
  }
  return parsed
}

function parseSections(value: string): CodeReviewGuideSection[] {
  const parsed = JSON.parse(value) as CodeReviewGuideSection[]
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid code review guide sections')
  }
  return parsed.map((section) => ({
    ...section,
    riskRationale:
      typeof section.riskRationale === 'string' &&
      section.riskRationale.trim().length > 0
        ? section.riskRationale
        : fallbackRiskRationale(section.riskLevel),
  }))
}

function fallbackRiskRationale(riskLevel: CodeReviewGuideRiskLevel): string {
  switch (riskLevel) {
    case 'high':
      return 'Marked high risk because this section may affect critical contracts or runtime behavior.'
    case 'medium':
      return 'Marked medium risk because this section may affect shared behavior or user-facing flow.'
    case 'low':
      return 'Marked low risk because this section is unlikely to change runtime behavior directly.'
  }
}
