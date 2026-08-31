import type {
  ForkArtifacts,
  ForkSummary,
  ConversationItem,
} from '@/entities/session'

const CHARS_PER_TOKEN_ESTIMATE = 4
const SIZE_WARNING_THRESHOLD = 0.8

export function estimateTranscriptTokens(items: ConversationItem[]): number {
  let chars = 0
  for (const item of items) {
    chars += JSON.stringify(item).length
  }
  return Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE)
}

export interface SeedSizeWarning {
  estimatedTokens: number
  windowTokens: number
  percentage: number
}

export function computeSeedSizeWarning(
  items: ConversationItem[],
  windowTokens: number | null | undefined,
): SeedSizeWarning | null {
  if (!windowTokens || windowTokens <= 0) return null
  const estimatedTokens = estimateTranscriptTokens(items)
  const ratio = estimatedTokens / windowTokens
  if (ratio < SIZE_WARNING_THRESHOLD) return null
  return {
    estimatedTokens,
    windowTokens,
    percentage: Math.round(ratio * 100),
  }
}

export const FORK_PROGRESS_SECONDARY_THRESHOLD_MS = 30_000
export const FORK_PROGRESS_EXTENDED_THRESHOLD_MS = 90_000
export const FORK_PROGRESS_STALE_THRESHOLD_MS = 30_000

export interface ForkProgressLabel {
  primary: string
  secondary: string | null
  stale: boolean
}

export function deriveForkProgressLabel(args: {
  elapsedMs: number
  msSinceLastEvent: number
}): ForkProgressLabel {
  const seconds = Math.floor(args.elapsedMs / 1000)
  const primary = `Extracting summary from parent transcript… (${seconds}s)`

  const secondary =
    args.elapsedMs >= FORK_PROGRESS_SECONDARY_THRESHOLD_MS
      ? 'Still working. Long transcripts can take a couple of minutes.'
      : null

  const stale =
    args.elapsedMs >= FORK_PROGRESS_EXTENDED_THRESHOLD_MS &&
    args.msSinceLastEvent >= FORK_PROGRESS_STALE_THRESHOLD_MS

  return { primary, secondary, stale }
}

function renderList(items: string[], bullet = '- '): string {
  return items.map((item) => `${bullet}${item}`).join('\n')
}

function renderEvidencedList(
  items: Array<{ text: string; evidence: string }>,
): string {
  return items.map((item) => `- ${item.text} — "${item.evidence}"`).join('\n')
}

function hasAnyArtifact(artifacts: ForkArtifacts): boolean {
  return (
    artifacts.urls.length > 0 ||
    artifacts.file_paths.length > 0 ||
    artifacts.repos.length > 0 ||
    artifacts.commands.length > 0 ||
    artifacts.identifiers.length > 0
  )
}

export function renderSeedMarkdown(input: {
  summary: ForkSummary
  parentName: string
  additionalInstruction: string | null
}): string {
  const { summary, parentName, additionalInstruction } = input
  const sections: string[] = [
    `This session is a fork of "${parentName}". Prior context:`,
    '',
    `**Topic:** ${summary.topic}`,
  ]

  if (summary.decisions.length > 0) {
    sections.push(
      '',
      '**Decisions made so far:**',
      renderEvidencedList(summary.decisions),
    )
  }

  if (summary.key_facts.length > 0) {
    sections.push(
      '',
      '**Key facts established:**',
      renderEvidencedList(summary.key_facts),
    )
  }

  if (summary.open_questions.length > 0) {
    sections.push('', '**Open questions:**', renderList(summary.open_questions))
  }

  if (hasAnyArtifact(summary.artifacts)) {
    const artifactLines: string[] = ['', '**Relevant artifacts:**']
    if (summary.artifacts.urls.length > 0) {
      artifactLines.push(`- URLs: ${summary.artifacts.urls.join(', ')}`)
    }
    if (summary.artifacts.file_paths.length > 0) {
      artifactLines.push(`- Files: ${summary.artifacts.file_paths.join(', ')}`)
    }
    if (summary.artifacts.repos.length > 0) {
      artifactLines.push(`- Repos: ${summary.artifacts.repos.join(', ')}`)
    }
    if (summary.artifacts.commands.length > 0) {
      artifactLines.push(
        `- Commands run: ${summary.artifacts.commands.join(', ')}`,
      )
    }
    if (summary.artifacts.identifiers.length > 0) {
      artifactLines.push(
        `- Identifiers: ${summary.artifacts.identifiers.join(', ')}`,
      )
    }
    sections.push(...artifactLines)
  }

  if (summary.next_steps.length > 0) {
    sections.push(
      '',
      '**Suggested next steps:**',
      renderList(summary.next_steps),
    )
  }

  sections.push('', '---', '')
  const tail = additionalInstruction?.trim()
  sections.push(tail && tail.length > 0 ? tail : 'Continue from here.')

  return sections.join('\n')
}
