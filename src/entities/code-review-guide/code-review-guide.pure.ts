import type {
  CodeReviewCacheIdentity,
  CodeReviewFileEntry,
  CodeReviewMode,
  CodeReviewTarget,
} from '@/entities/code-review'
import type {
  CodeReviewGuideContent,
  CodeReviewGuideFile,
  CodeReviewGuideRiskLevel,
  CodeReviewGuideSection,
} from './code-review-guide.types'

interface SectionDefinition {
  id: string
  title: string
  summary: string
  narrative: string
  checklist: string[]
  riskLevel: CodeReviewGuideRiskLevel
  riskRationale: string
  matches: (file: CodeReviewFileEntry) => boolean
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

export function buildDeterministicCodeReviewGuide(
  files: CodeReviewFileEntry[],
): CodeReviewGuideContent {
  const remaining = [...files]
  const sections: CodeReviewGuideSection[] = []

  for (const definition of SECTION_DEFINITIONS) {
    const matched = remaining.filter(definition.matches)
    if (matched.length === 0) continue

    sections.push(buildSection(definition, matched))
    removeMatchedFiles(remaining, matched)
  }

  if (remaining.length > 0) {
    sections.push(
      buildSection(
        {
          id: 'other-changes',
          title: 'Other Changes',
          summary:
            'Changed files that do not fit a more specific deterministic group.',
          narrative:
            'These files still need review. The deterministic guide keeps them visible until AI grouping can classify them more precisely.',
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
        remaining,
      ),
    )
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

export function buildCodeReviewGuideKey(input: {
  target: CodeReviewTarget
  mode: CodeReviewMode
  cacheIdentity: CodeReviewCacheIdentity
}): string {
  return [
    input.target.id,
    input.mode,
    input.cacheIdentity.comparisonRef ?? '',
    input.cacheIdentity.comparisonPoint ?? '',
    input.cacheIdentity.workingTreeVersionToken,
  ].join('::')
}

export function getCodeReviewGuideFileCount(
  guide: CodeReviewGuideContent,
): number {
  return guide.sections.reduce(
    (count, section) => count + section.files.length,
    0,
  )
}

export function getCodeReviewGuideRiskRationale(
  section: CodeReviewGuideSection,
): string {
  if (section.riskRationale.trim().length > 0) {
    return section.riskRationale
  }

  switch (section.riskLevel) {
    case 'high':
      return 'Marked high risk because this section may affect critical contracts or runtime behavior.'
    case 'medium':
      return 'Marked medium risk because this section may affect shared behavior or user-facing flow.'
    case 'low':
      return 'Marked low risk because this section is unlikely to change runtime behavior directly.'
  }
}

function buildSection(
  definition: SectionDefinition,
  files: CodeReviewFileEntry[],
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

function mapGuideFile(file: CodeReviewFileEntry): CodeReviewGuideFile {
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
  remaining: CodeReviewFileEntry[],
  matched: CodeReviewFileEntry[],
): void {
  const matchedPaths = new Set(matched.map((file) => file.file))
  for (let index = remaining.length - 1; index >= 0; index -= 1) {
    if (matchedPaths.has(remaining[index].file)) {
      remaining.splice(index, 1)
    }
  }
}
