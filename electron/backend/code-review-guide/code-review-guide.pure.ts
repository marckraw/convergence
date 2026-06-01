import type { ChangedFileEntry } from '../git/changed-files.types'
import type { CodeReviewCacheIdentity } from '../code-review/code-review.types'
import type {
  CodeReviewGuideDraft,
  CodeReviewGuideFile,
  CodeReviewGuidePromptInput,
  CodeReviewGuideRiskLevel,
  CodeReviewGuideSection,
  CodeReviewGuideValidationResult,
} from './code-review-guide.types'

interface SectionDefinition {
  id: string
  title: string
  summary: string
  narrative: string
  checklist: string[]
  riskLevel: CodeReviewGuideRiskLevel
  riskRationale: string
  matches: (file: ChangedFileEntry) => boolean
}

const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    id: 'backend-runtime',
    title: 'Backend and Runtime Boundaries',
    summary:
      'Electron backend, preload, IPC, database, or provider runtime changes.',
    narrative:
      'Start here when the change touches process boundaries, persistence, or provider orchestration. These files usually define what the renderer can safely rely on.',
    riskLevel: 'high',
    riskRationale:
      'Touches backend/runtime boundaries where contract, persistence, or provider failures can affect the whole review flow.',
    checklist: [
      'Confirm IPC and preload contracts stay renderer-safe.',
      'Check persistence and runtime changes for migration or compatibility risk.',
      'Verify provider behavior remains isolated behind backend services.',
    ],
    matches: (file) =>
      file.file.startsWith('electron/') ||
      file.file.includes('/database/') ||
      file.file.includes('/provider/'),
  },
  {
    id: 'renderer-state',
    title: 'Renderer State and Domain Model',
    summary: 'Renderer entities, shared models, APIs, and pure state helpers.',
    narrative:
      'Review these files as the contract layer for UI behavior. They should keep side effects behind API wrappers and expose stable view models to widgets and features.',
    riskLevel: 'medium',
    riskRationale:
      'Changes shared renderer contracts and state helpers that multiple UI surfaces may depend on.',
    checklist: [
      'Check public slice APIs and FSD-lite dependency direction.',
      'Confirm state transitions are deterministic and testable.',
      'Look for renderer access to Electron outside approved API wrappers.',
    ],
    matches: (file) =>
      file.file.startsWith('src/entities/') ||
      file.file.startsWith('src/shared/'),
  },
  {
    id: 'tests',
    title: 'Tests and Fixtures',
    summary: 'Unit, pure, integration-style, and fixture changes.',
    narrative:
      'Review tests after the implementation sections so the assertions are easy to connect back to the behavior being protected.',
    riskLevel: 'low',
    riskRationale:
      'Mostly tests or fixtures; important for coverage, but less likely to alter runtime behavior directly.',
    checklist: [
      'Check tests assert user-visible behavior or stable contracts.',
      'Avoid overfitting tests to implementation details.',
      'Confirm important edge cases have coverage.',
    ],
    matches: (file) =>
      file.file.includes('.test.') ||
      file.file.includes('/test/') ||
      file.file.includes('/fixtures/'),
  },
  {
    id: 'review-surface',
    title: 'Review Surface and UI Flow',
    summary:
      'App, feature, widget, and route changes that shape the review experience.',
    narrative:
      'Use this section to inspect user-facing review flow, selection state, route behavior, and compact layout decisions.',
    riskLevel: 'medium',
    riskRationale:
      'Affects user-facing review flow and layout, so regressions are visible even when data contracts stay stable.',
    checklist: [
      'Verify controls map to predictable review actions.',
      'Check layout density across common laptop widths.',
      'Confirm presentational components remain render-only.',
    ],
    matches: (file) =>
      file.file.startsWith('src/app/') ||
      file.file.startsWith('src/features/') ||
      file.file.startsWith('src/widgets/'),
  },
  {
    id: 'docs-and-config',
    title: 'Documentation, Tooling, and Config',
    summary:
      'Docs, package metadata, build config, and project tooling updates.',
    narrative:
      'These files often explain or enable the implementation. Review them last unless they change runtime behavior.',
    riskLevel: 'low',
    riskRationale:
      'Primarily docs, package metadata, or tooling; review for accuracy and accidental churn rather than runtime risk.',
    checklist: [
      'Confirm docs match the implemented behavior.',
      'Check package and config changes for install or build impact.',
      'Look for accidental broad formatting or metadata churn.',
    ],
    matches: (file) =>
      file.file.startsWith('docs/') ||
      file.file === 'package.json' ||
      file.file === 'package-lock.json' ||
      file.file.endsWith('.config.ts') ||
      file.file.endsWith('.config.mjs') ||
      file.file.endsWith('.yml') ||
      file.file.endsWith('.yaml'),
  },
]

export function buildCodeReviewGuideCacheKey(
  cacheIdentity: CodeReviewCacheIdentity,
): string {
  return JSON.stringify({
    comparisonRef: cacheIdentity.comparisonRef,
    comparisonPoint: cacheIdentity.comparisonPoint,
    workingTreeVersionToken: cacheIdentity.workingTreeVersionToken,
  })
}

export function buildDeterministicCodeReviewGuideDraft(
  files: ChangedFileEntry[],
): CodeReviewGuideDraft {
  const remaining = [...files]
  const sections: CodeReviewGuideSection[] = []

  for (const definition of SECTION_DEFINITIONS) {
    const matched = remaining.filter(definition.matches)
    if (matched.length === 0) continue

    sections.push(buildSection(definition, matched))
    removeMatchedFiles(remaining, matched)
  }

  if (remaining.length > 0) {
    sections.push(buildOtherChangesSection(remaining))
  }

  return {
    overview:
      sections.length === 0
        ? 'No changed files are available for a deterministic guide.'
        : `Deterministic guide grouped ${files.length} changed file${files.length === 1 ? '' : 's'} into ${sections.length} review section${sections.length === 1 ? '' : 's'}.`,
    generatedBy: 'deterministic',
    sections,
  }
}

export function normalizeCodeReviewGuideDraft(input: {
  draft: CodeReviewGuideDraft
  files: ChangedFileEntry[]
}): CodeReviewGuideDraft {
  const filesByPath = new Map(input.files.map((file) => [file.file, file]))
  const assigned = new Set<string>()
  const sections: CodeReviewGuideSection[] = []

  for (const section of input.draft.sections) {
    const normalizedFiles = section.files.flatMap((file) => {
      const changedFile = filesByPath.get(file.path)
      if (!changedFile || assigned.has(file.path)) return []
      assigned.add(file.path)
      return [
        {
          ...file,
          status: changedFile.status,
          hunkHints: Array.isArray(file.hunkHints) ? file.hunkHints : [],
        },
      ]
    })

    if (normalizedFiles.length === 0) continue

    sections.push({
      ...section,
      files: normalizedFiles,
    })
  }

  const unassignedFiles = input.files.filter((file) => !assigned.has(file.file))
  if (unassignedFiles.length > 0) {
    sections.push(buildOtherChangesSection(unassignedFiles))
  }

  return {
    ...input.draft,
    overview:
      sections.length === 0
        ? 'No changed files are available for this guide.'
        : input.draft.overview,
    sections,
  }
}

export const CODE_REVIEW_GUIDE_RETRY_SUFFIX =
  '\n\nYour previous output was not valid JSON matching the schema. Return only the JSON object.'

export function buildCodeReviewGuidePrompt(
  input: CodeReviewGuidePromptInput,
): string {
  const fileList =
    input.files.length === 0
      ? '(none)'
      : input.files
          .map((file, index) => `${index + 1}. ${file.status} ${file.file}`)
          .join('\n')

  const patchSections =
    input.patches.length === 0
      ? '(no patch excerpts available)'
      : input.patches
          .map((patch, index) =>
            [
              `Patch ${index + 1}: ${patch.status} ${patch.filePath}${patch.truncated ? ' (truncated)' : ''}`,
              '```diff',
              patch.diffExcerpt || '(empty diff)',
              '```',
            ].join('\n'),
          )
          .join('\n\n')

  return [
    'You create a guided code review walkthrough from a local diff.',
    '',
    'Return a SINGLE JSON object matching this schema:',
    '{',
    '  "overview": string,',
    '  "sections": [',
    '    {',
    '      "id": string,',
    '      "title": string,',
    '      "summary": string,',
    '      "narrative": string,',
    '      "risk_level": "low" | "medium" | "high",',
    '      "risk_rationale": string,',
    '      "checklist": [string],',
    '      "files": [',
    '        {',
    '          "path": string,',
    '          "reason": string,',
    '          "hunk_hints": [string]',
    '        }',
    '      ]',
    '    }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- Build 2-7 ordered sections that tell the reviewer where to start and why.',
    '- Group files by implementation story, not by folder alone.',
    '- Put risky contracts, runtime boundaries, data flow, and public APIs before tests/docs.',
    '- risk_rationale must explain why that section received its risk_level in one concise sentence.',
    '- Include only file paths from the changed file list. Do not invent files.',
    '- Every changed file should appear in exactly one section when relevant.',
    '- Use concise section text written for code reviewers.',
    '- Checklist items should be concrete review actions.',
    '- hunk_hints should point to important behavior to inspect, not line numbers unless obvious from the diff.',
    '- Empty arrays are allowed only for hunk_hints. Sections must contain files.',
    '- Return ONLY the JSON object. No markdown fences. No commentary.',
    '',
    'Review target:',
    `- target_id: ${input.target.id}`,
    `- project: ${input.target.projectName}`,
    `- source: ${input.target.source}`,
    `- branch: ${input.target.branchName ?? '(unknown)'}`,
    `- session: ${input.target.sessionName ?? '(none)'}`,
    `- mode: ${input.mode}`,
    '',
    'Changed files:',
    fileList,
    '',
    'Bounded patch excerpts:',
    patchSections,
  ].join('\n')
}

export function parseAndValidateAgentGuide(
  raw: string,
  files: ChangedFileEntry[],
): CodeReviewGuideValidationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsonFences(raw))
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: 'parse',
        message: error instanceof Error ? error.message : 'invalid JSON',
      },
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      ok: false,
      error: { kind: 'schema', message: 'root is not object' },
    }
  }

  const obj = parsed as Record<string, unknown>
  if (typeof obj.overview !== 'string') {
    return {
      ok: false,
      error: { kind: 'schema', message: 'overview invalid', field: 'overview' },
    }
  }
  if (!Array.isArray(obj.sections)) {
    return {
      ok: false,
      error: { kind: 'schema', message: 'sections invalid', field: 'sections' },
    }
  }

  const sections: CodeReviewGuideSection[] = []
  for (const [index, sectionValue] of obj.sections.entries()) {
    const section = parseAgentSection(sectionValue, index)
    if (!section.ok) return section
    sections.push(section.value)
  }

  const normalized = normalizeCodeReviewGuideDraft({
    draft: {
      overview: obj.overview.trim() || 'Generated guide',
      generatedBy: 'agent',
      sections,
    },
    files,
  })

  return { ok: true, value: normalized }
}

function buildSection(
  definition: SectionDefinition,
  files: ChangedFileEntry[],
): CodeReviewGuideSection {
  return {
    id: definition.id,
    title: definition.title,
    summary: definition.summary,
    narrative: definition.narrative,
    riskLevel: definition.riskLevel,
    riskRationale: definition.riskRationale,
    checklist: definition.checklist,
    files: files.map(mapGuideFile),
  }
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i)
  if (fenced) return fenced[1].trim()
  return trimmed
}

function parseAgentSection(
  value: unknown,
  index: number,
):
  | { ok: true; value: CodeReviewGuideSection }
  | {
      ok: false
      error: { kind: 'schema'; message: string; field?: string }
    } {
  if (typeof value !== 'object' || value === null) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: 'section is not object',
        field: `sections.${index}`,
      },
    }
  }

  const obj = value as Record<string, unknown>
  const riskLevel = parseRiskLevel(obj.risk_level)
  if (!riskLevel) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: 'risk_level invalid',
        field: `sections.${index}.risk_level`,
      },
    }
  }
  if (!Array.isArray(obj.files) || obj.files.length === 0) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: 'section files invalid',
        field: `sections.${index}.files`,
      },
    }
  }

  const files = obj.files.flatMap((fileValue) => parseAgentFile(fileValue))
  if (files.length !== obj.files.length) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: 'section file invalid',
        field: `sections.${index}.files`,
      },
    }
  }

  return {
    ok: true,
    value: {
      id: requiredString(obj.id) || `section-${index + 1}`,
      title: requiredString(obj.title) || `Section ${index + 1}`,
      summary: requiredString(obj.summary) || '',
      narrative: requiredString(obj.narrative) || '',
      riskLevel,
      riskRationale:
        requiredString(obj.risk_rationale) ||
        buildFallbackRiskRationale(riskLevel),
      checklist: stringArray(obj.checklist),
      files,
    },
  }
}

function parseAgentFile(value: unknown): CodeReviewGuideFile[] {
  if (typeof value !== 'object' || value === null) return []
  const obj = value as Record<string, unknown>
  const path = requiredString(obj.path)
  const reason = requiredString(obj.reason)
  if (!path || !reason) return []
  return [
    {
      path,
      status: '',
      reason,
      hunkHints: stringArray(obj.hunk_hints),
    },
  ]
}

function parseRiskLevel(value: unknown): CodeReviewGuideRiskLevel | null {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return null
}

function requiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function buildOtherChangesSection(
  files: ChangedFileEntry[],
): CodeReviewGuideSection {
  return buildSection(
    {
      id: 'other-changes',
      title: 'Other Changes',
      summary: 'Changed files that do not fit a more specific review group.',
      narrative:
        'These files still need review. The guide keeps them visible so no changed file silently disappears.',
      riskLevel: 'medium',
      riskRationale:
        'Unclassified changes can still hide cross-cutting behavior and should be reviewed before approval.',
      checklist: [
        'Confirm each remaining file belongs in this change.',
        'Look for cross-cutting behavior not represented in earlier sections.',
        'Decide whether any file should be moved into a focused review section.',
      ],
      matches: () => true,
    },
    files,
  )
}

function buildFallbackRiskRationale(
  riskLevel: CodeReviewGuideRiskLevel,
): string {
  switch (riskLevel) {
    case 'high':
      return 'Marked high risk because the section may affect critical contracts or runtime behavior.'
    case 'medium':
      return 'Marked medium risk because the section can affect shared behavior or user-facing flow.'
    case 'low':
      return 'Marked low risk because the section is unlikely to change runtime behavior directly.'
  }
}

function mapGuideFile(file: ChangedFileEntry): CodeReviewGuideFile {
  return {
    path: file.file,
    status: file.status,
    reason: `Review this ${getStatusLabel(file.status)} file as part of the section's implementation story.`,
    hunkHints: [],
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'M':
      return 'modified'
    case 'R':
      return 'renamed'
    default:
      return status
  }
}

function removeMatchedFiles(
  remaining: ChangedFileEntry[],
  matched: ChangedFileEntry[],
): void {
  const matchedPaths = new Set(matched.map((file) => file.file))
  for (let index = remaining.length - 1; index >= 0; index -= 1) {
    if (matchedPaths.has(remaining[index].file)) {
      remaining.splice(index, 1)
    }
  }
}
