import { describe, expect, it } from 'vitest'
import type { ReviewNote } from './review-notes.types'
import { buildReviewNotePacket } from './review-note-prompt.pure'

describe('buildReviewNotePacket', () => {
  it('returns an explicit empty preview when no draft notes are selected', () => {
    const packet = buildReviewNotePacket({
      notes: [],
      session: makeSessionContext(),
      pullRequest: null,
    })

    expect(packet.noteCount).toBe(0)
    expect(packet.text).toContain('No draft review notes are selected.')
  })

  it('includes PR metadata when available and asks for explanation without file changes', () => {
    const packet = buildReviewNotePacket({
      notes: [
        makeNote({
          filePath: 'src/app.ts',
          body: 'Why use this branch?',
          selectedDiff: '+const value = condition ? a : b',
        }),
      ],
      session: makeSessionContext(),
      pullRequest: {
        repositoryOwner: 'marckraw',
        repositoryName: 'convergence',
        number: 42,
        title: 'Review notes',
        url: 'https://github.com/marckraw/convergence/pull/42',
        state: 'open',
        baseBranch: 'master',
        headBranch: 'feature',
      },
    })

    expect(packet.noteCount).toBe(1)
    expect(packet.text).toContain('Repository: marckraw/convergence')
    expect(packet.text).toContain('Pull request: #42: Review notes')
    expect(packet.text).toContain('Base branch: master')
    expect(packet.text).toContain('Head branch: feature')
    expect(packet.text).toContain('why it may have been implemented this way')
    expect(packet.text).toContain(
      'Do not change files unless I explicitly ask for fixes.',
    )
  })

  it('groups notes by file path in stable order with line ranges and diff snippets', () => {
    const packet = buildReviewNotePacket({
      notes: [
        makeNote({
          id: 'a',
          filePath: 'src/a.ts',
          newStartLine: 5,
          newEndLine: 7,
          body: 'First A',
          selectedDiff: '+a',
        }),
        makeNote({
          id: 'b',
          filePath: 'src/b.ts',
          oldStartLine: 2,
          oldEndLine: 2,
          newStartLine: null,
          newEndLine: null,
          body: 'Only B',
          selectedDiff: '-b',
        }),
        makeNote({
          id: 'c',
          filePath: 'src/a.ts',
          oldStartLine: 10,
          newStartLine: 11,
          newEndLine: 11,
          body: 'Second A',
          selectedDiff: '-old\n+new',
        }),
      ],
      session: makeSessionContext(),
      pullRequest: null,
    })

    expect(packet.text.indexOf('## src/a.ts')).toBeLessThan(
      packet.text.indexOf('## src/b.ts'),
    )
    expect(packet.text.match(/## src\/a\.ts/g)?.length).toBe(1)
    expect(packet.text).toContain('### Note 1 - new 5-7 (working-tree)')
    expect(packet.text).toContain('### Note 2 - old 10, new 11 (working-tree)')
    expect(packet.text).toContain('### Note 3 - old 2 (working-tree)')
    expect(packet.text).toContain('```diff\n-old\n+new\n```')
  })

  it('uses a longer markdown fence when selected diff contains backticks', () => {
    const packet = buildReviewNotePacket({
      notes: [
        makeNote({
          selectedDiff: '+const markdown = "```diff"',
        }),
      ],
      session: makeSessionContext(),
      pullRequest: null,
    })

    expect(packet.text).toContain('````diff\n+const markdown = "```diff"\n````')
  })

  it('keeps working context when PR metadata is missing', () => {
    const packet = buildReviewNotePacket({
      notes: [makeNote({ body: 'Question' })],
      session: makeSessionContext({
        projectName: null,
        workspaceBranchName: null,
        workspacePath: null,
      }),
      pullRequest: null,
    })

    expect(packet.text).toContain('Project: Unknown')
    expect(packet.text).toContain('Workspace path: Unknown')
    expect(packet.text).toContain('Pull request: Unknown for this workspace')
  })

  it('labels file-level notes without line ranges', () => {
    const packet = buildReviewNotePacket({
      notes: [
        makeNote({
          oldStartLine: null,
          oldEndLine: null,
          newStartLine: null,
          newEndLine: null,
          hunkHeader: null,
          selectedDiff: '(file-level note; no specific diff lines selected)',
        }),
      ],
      session: makeSessionContext(),
      pullRequest: null,
    })

    expect(packet.text).toContain('### Note 1 - file (working-tree)')
  })
})

function makeSessionContext(
  patch: Partial<Parameters<typeof buildReviewNotePacket>[0]['session']> = {},
): Parameters<typeof buildReviewNotePacket>[0]['session'] {
  return {
    sessionId: 'session-1',
    projectName: 'Convergence',
    workspacePath: '/tmp/workspace',
    workspaceBranchName: 'feature',
    workingDirectory: '/tmp/workspace',
    ...patch,
  }
}

function makeNote(patch: Partial<ReviewNote>): ReviewNote {
  return {
    id: 'note-1',
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    filePath: 'src/app.ts',
    mode: 'working-tree',
    oldStartLine: null,
    oldEndLine: null,
    newStartLine: 1,
    newEndLine: 1,
    hunkHeader: '@@ -1 +1 @@',
    selectedDiff: '+line',
    body: 'Question',
    state: 'draft',
    sentAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  }
}
