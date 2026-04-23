import type { ConversationItem } from '../conversation-item.types'
import type {
  ForkArtifacts,
  ForkSummary,
  SummaryValidationResult,
} from './session-fork.types'

export const EXTRACTION_INSTRUCTION = [
  'You distill a conversation into a structured JSON summary.',
  'Read the transcript below and output a SINGLE JSON object matching this schema:',
  '{',
  '  "topic": string,',
  '  "decisions": [{ "text": string, "evidence": string }],',
  '  "open_questions": [string],',
  '  "key_facts": [{ "text": string, "evidence": string }],',
  '  "artifacts": {',
  '    "urls": [string],',
  '    "file_paths": [string],',
  '    "repos": [string],',
  '    "commands": [string],',
  '    "identifiers": [string]',
  '  },',
  '  "next_steps": [string]',
  '}',
  '',
  'Rules:',
  '- Only include facts and decisions that actually appear in the transcript.',
  '- For each decision and key_fact, include a short verbatim quote from the transcript as the "evidence" field.',
  '- In "artifacts", copy strings verbatim (URLs, file paths, repo slugs, commands, ticket/PR identifiers). Do not paraphrase.',
  '- Empty arrays are allowed. Omit nothing.',
  '- Output ONLY the JSON object. No markdown fences. No commentary.',
].join('\n')

export const RETRY_SUFFIX =
  '\n\nYour previous output was not valid JSON matching the schema. Return only the JSON object.'

function truncateEntry(text: string, cap: number): string {
  if (text.length <= cap) return text
  return text.slice(0, cap) + '…'
}

const ENTRY_CAP = 4000

export function serializeConversationItems(items: ConversationItem[]): string {
  const lines: string[] = []
  for (const item of items) {
    switch (item.kind) {
      case 'message':
        lines.push(`${item.actor}: ${truncateEntry(item.text, ENTRY_CAP)}`)
        break
      case 'thinking':
        lines.push(`thinking: ${truncateEntry(item.text, ENTRY_CAP)}`)
        break
      case 'note':
        lines.push(`system: ${truncateEntry(item.text, ENTRY_CAP)}`)
        break
      case 'tool-call':
        lines.push(`[tool ${item.toolName}]`)
        break
      case 'tool-result':
        lines.push('[tool result]')
        break
      case 'approval-request':
        lines.push(`[approval requested: ${item.description}]`)
        break
      case 'input-request':
        lines.push(`[input requested: ${item.prompt}]`)
        break
    }
  }
  return lines.join('\n\n')
}

export function buildExtractionPrompt(serializedTranscript: string): string {
  return [
    EXTRACTION_INSTRUCTION,
    '',
    'Transcript:',
    '',
    serializedTranscript,
  ].join('\n')
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i)
  if (fenced) return fenced[1].trim()
  return trimmed
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && item.length > 0)
  )
}

function isEvidencedArray(
  value: unknown,
): value is Array<{ text: string; evidence: string }> {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { text?: unknown }).text === 'string' &&
        (item as { text: string }).text.length > 0 &&
        typeof (item as { evidence?: unknown }).evidence === 'string' &&
        (item as { evidence: string }).evidence.length > 0,
    )
  )
}

export function parseAndValidateSummary(raw: string): SummaryValidationResult {
  const stripped = stripJsonFences(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
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

  if (typeof obj.topic !== 'string' || obj.topic.trim().length === 0) {
    return {
      ok: false,
      error: { kind: 'schema', message: 'missing topic', field: 'topic' },
    }
  }

  if (!isEvidencedArray(obj.decisions)) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: 'decisions invalid',
        field: 'decisions',
      },
    }
  }

  if (
    !Array.isArray(obj.open_questions) ||
    !obj.open_questions.every((q) => typeof q === 'string' && q.length > 0)
  ) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: 'open_questions invalid',
        field: 'open_questions',
      },
    }
  }

  if (!isEvidencedArray(obj.key_facts)) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: 'key_facts invalid',
        field: 'key_facts',
      },
    }
  }

  if (typeof obj.artifacts !== 'object' || obj.artifacts === null) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: 'artifacts missing',
        field: 'artifacts',
      },
    }
  }

  const artifacts = obj.artifacts as Record<string, unknown>
  const artifactFields = [
    'urls',
    'file_paths',
    'repos',
    'commands',
    'identifiers',
  ] as const
  for (const field of artifactFields) {
    if (!isStringArray(artifacts[field])) {
      return {
        ok: false,
        error: {
          kind: 'schema',
          message: `artifacts.${field} invalid`,
          field: `artifacts.${field}`,
        },
      }
    }
  }

  if (
    !Array.isArray(obj.next_steps) ||
    !obj.next_steps.every((s) => typeof s === 'string' && s.length > 0)
  ) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: 'next_steps invalid',
        field: 'next_steps',
      },
    }
  }

  return {
    ok: true,
    value: {
      topic: obj.topic.trim(),
      decisions: (obj.decisions as ForkSummary['decisions']).map((d) => ({
        text: d.text.trim(),
        evidence: d.evidence.trim(),
      })),
      open_questions: (obj.open_questions as string[]).map((q) => q.trim()),
      key_facts: (obj.key_facts as ForkSummary['key_facts']).map((f) => ({
        text: f.text.trim(),
        evidence: f.evidence.trim(),
      })),
      artifacts: {
        urls: artifacts.urls as string[],
        file_paths: artifacts.file_paths as string[],
        repos: artifacts.repos as string[],
        commands: artifacts.commands as string[],
        identifiers: artifacts.identifiers as string[],
      },
      next_steps: (obj.next_steps as string[]).map((s) => s.trim()),
    },
  }
}

const URL_REGEX = /\bhttps?:\/\/[^\s<>()"'`]+[^\s<>()"'`.,:;!?]/gi
const FILE_PATH_REGEX =
  /(?:^|\s|["'`(])((?:\.{0,2}\/)?(?:[\w.-]+\/)+[\w.-]+(?::\d+(?::\d+)?)?)/g
const REPO_REGEX =
  /\b(?:github\.com|gitlab\.com|bitbucket\.org)[:/][\w.-]+\/[\w.-]+/gi
const IDENTIFIER_REGEX = /(?<![\w])#\d+|\b[A-Z][A-Z0-9]+-\d+\b/g

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

export function extractArtifactsByRegex(
  serializedTranscript: string,
): ForkArtifacts {
  const urls = unique(serializedTranscript.match(URL_REGEX) ?? [])
  const repos = unique(serializedTranscript.match(REPO_REGEX) ?? [])

  const pathMatches: string[] = []
  for (const match of serializedTranscript.matchAll(FILE_PATH_REGEX)) {
    pathMatches.push(match[1])
  }
  const file_paths = unique(
    pathMatches.filter(
      (path) =>
        !urls.some((url) => url.includes(path)) &&
        !repos.some((repo) => repo.includes(path)),
    ),
  )

  const identifiers = unique(serializedTranscript.match(IDENTIFIER_REGEX) ?? [])

  return {
    urls,
    file_paths,
    repos,
    commands: [],
    identifiers,
  }
}

export function mergeArtifacts(
  llm: ForkArtifacts,
  regex: ForkArtifacts,
): ForkArtifacts {
  return {
    urls: unique([...llm.urls, ...regex.urls]),
    file_paths: unique([...llm.file_paths, ...regex.file_paths]),
    repos: unique([...llm.repos, ...regex.repos]),
    commands: unique([...llm.commands, ...regex.commands]),
    identifiers: unique([...llm.identifiers, ...regex.identifiers]),
  }
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

export const FORK_SEED_SEPARATOR = '\n\n---\n\n'
export const DEFAULT_FORK_SEED_TAIL = 'Continue from here.'

function renderForkSeedTail(additionalInstruction: string | null): string {
  const tail = additionalInstruction?.trim()
  return tail && tail.length > 0 ? tail : DEFAULT_FORK_SEED_TAIL
}

export function applyAdditionalInstructionToSeed(
  seedMarkdown: string,
  additionalInstruction: string | null,
): string {
  const instruction = additionalInstruction?.trim()
  const trimmedSeed = seedMarkdown.trimEnd()
  if (!instruction) {
    return trimmedSeed
  }

  const expectedTail = `${FORK_SEED_SEPARATOR}${instruction}`
  if (trimmedSeed.endsWith(expectedTail)) {
    return trimmedSeed
  }

  const defaultTail = `${FORK_SEED_SEPARATOR}${DEFAULT_FORK_SEED_TAIL}`
  if (trimmedSeed.endsWith(defaultTail)) {
    return trimmedSeed.slice(0, -defaultTail.length) + expectedTail
  }

  if (trimmedSeed.length === 0) {
    return instruction
  }

  return `${trimmedSeed}${FORK_SEED_SEPARATOR}${instruction}`
}

export function renderFullSeed(input: {
  serializedTranscript: string
  parentName: string
  additionalInstruction: string | null
}): string {
  const { serializedTranscript, parentName, additionalInstruction } = input
  const sections: string[] = [
    `This session is a fork of "${parentName}". Prior transcript:`,
    '',
    serializedTranscript,
    '',
    '---',
    '',
  ]
  sections.push(renderForkSeedTail(additionalInstruction))
  return sections.join('\n')
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
  sections.push(renderForkSeedTail(additionalInstruction))

  return sections.join('\n')
}
