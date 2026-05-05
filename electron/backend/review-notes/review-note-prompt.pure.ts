import type {
  ReviewNote,
  ReviewNotePacketPreview,
  ReviewNotePacketPullRequestContext,
  ReviewNotePacketSessionContext,
} from './review-notes.types'

export interface BuildReviewNotePacketInput {
  notes: ReviewNote[]
  session: ReviewNotePacketSessionContext
  pullRequest: ReviewNotePacketPullRequestContext | null
}

export function buildReviewNotePacket(
  input: BuildReviewNotePacketInput,
): ReviewNotePacketPreview {
  if (input.notes.length === 0) {
    return {
      noteCount: 0,
      text: [
        'No draft review notes are selected.',
        '',
        'There is no review packet to send yet.',
      ].join('\n'),
    }
  }

  return {
    noteCount: input.notes.length,
    text: [
      'Please help me understand these local code review notes.',
      '',
      'Explain the relevant code, why it may have been implemented this way, whether each concern is valid, and what follow-up questions or risks I should consider. Do not change files unless I explicitly ask for fixes.',
      '',
      'Review context:',
      ...formatSessionContext(input.session),
      ...formatPullRequestContext(input.pullRequest),
      '',
      `Review notes (${input.notes.length}):`,
      '',
      ...formatGroupedNotes(input.notes),
    ].join('\n'),
  }
}

function formatSessionContext(
  context: ReviewNotePacketSessionContext,
): string[] {
  return [
    `- Project: ${context.projectName ?? 'Unknown'}`,
    `- Session: ${context.sessionId}`,
    `- Working directory: ${context.workingDirectory}`,
    `- Workspace path: ${context.workspacePath ?? 'Unknown'}`,
    `- Workspace branch: ${context.workspaceBranchName ?? 'Unknown'}`,
  ]
}

function formatPullRequestContext(
  pullRequest: ReviewNotePacketPullRequestContext | null,
): string[] {
  if (!pullRequest) {
    return ['- Pull request: Unknown for this workspace']
  }

  const repository =
    pullRequest.repositoryOwner && pullRequest.repositoryName
      ? `${pullRequest.repositoryOwner}/${pullRequest.repositoryName}`
      : 'Unknown'
  const prLabel =
    pullRequest.number === null
      ? 'Unknown'
      : `#${pullRequest.number}: ${pullRequest.title ?? 'Untitled PR'}`

  return [
    `- Repository: ${repository}`,
    `- Pull request: ${prLabel}`,
    `- URL: ${pullRequest.url ?? 'Unknown'}`,
    `- State: ${pullRequest.state ?? 'Unknown'}`,
    `- Base branch: ${pullRequest.baseBranch ?? 'Unknown'}`,
    `- Head branch: ${pullRequest.headBranch ?? 'Unknown'}`,
  ]
}

function formatGroupedNotes(notes: ReviewNote[]): string[] {
  const groups = groupByFile(notes)
  let noteIndex = 1

  return groups.flatMap((group) => [
    `## ${group.filePath}`,
    '',
    ...group.notes.flatMap((note) => formatNote(note, noteIndex++)),
  ])
}

function groupByFile(notes: ReviewNote[]): Array<{
  filePath: string
  notes: ReviewNote[]
}> {
  const groups = new Map<string, ReviewNote[]>()
  for (const note of notes) {
    groups.set(note.filePath, [...(groups.get(note.filePath) ?? []), note])
  }
  return [...groups.entries()].map(([filePath, groupedNotes]) => ({
    filePath,
    notes: groupedNotes,
  }))
}

function formatNote(note: ReviewNote, index: number): string[] {
  return [
    `### Note ${index} - ${formatNoteLocation(note)} (${note.mode})`,
    '',
    'Reviewer note:',
    note.body,
    '',
    'Selected diff:',
    ...formatFencedDiff(note.selectedDiff),
    '',
  ]
}

function formatFencedDiff(diff: string): string[] {
  const fence = '`'.repeat(Math.max(3, longestBacktickRun(diff) + 1))
  return [`${fence}diff`, diff, fence]
}

function longestBacktickRun(value: string): number {
  return Math.max(
    0,
    ...Array.from(value.matchAll(/`+/g), (match) => match[0].length),
  )
}

function formatNoteLocation(note: ReviewNote): string {
  const oldRange = formatLineRange(note.oldStartLine, note.oldEndLine)
  const newRange = formatLineRange(note.newStartLine, note.newEndLine)
  if (oldRange && newRange) return `old ${oldRange}, new ${newRange}`
  if (oldRange) return `old ${oldRange}`
  if (newRange) return `new ${newRange}`
  return 'file'
}

function formatLineRange(start: number | null, end: number | null): string {
  if (start === null) return ''
  if (end === null || end === start) return String(start)
  return `${start}-${end}`
}
