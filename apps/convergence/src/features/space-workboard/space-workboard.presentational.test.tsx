import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { selectOption } from '@/shared/testing/select-option'
import type { Space, SpaceAttempt, SpaceArtifact } from '@/entities/space'
import { SpaceWorkboardDialog } from './space-workboard.presentational'
import type {
  SpaceAttemptView,
  SpaceDraft,
  SpaceArtifactDraft,
} from './space-workboard.presentational'

const space: Space = {
  id: 'i1',
  title: 'Agent-native work tracking',
  status: 'exploring',
  attention: 'needs-decision',
  brief: 'Start with a lightweight workboard.',
  memory: '',
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T12:00:00.000Z',
}

const draft: SpaceDraft = {
  title: space.title,
  status: space.status,
  attention: space.attention,
  brief: space.brief,
}

const attempt: SpaceAttempt = {
  id: 'a1',
  spaceId: 'i1',
  sessionId: 's1',
  role: 'implementation',
  isPrimary: false,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const attemptView: SpaceAttemptView = {
  attempt,
  sessionName: 'Implement workboard',
  projectName: 'convergence',
  branchName: 'feat/spaces',
  workingDirectory: '/tmp/convergence',
  providerId: 'codex',
  status: 'completed',
  attention: 'finished',
  missing: false,
}

const artifact: SpaceArtifact = {
  id: 'o1',
  spaceId: 'i1',
  kind: 'pull-request',
  label: 'Public PR',
  value: 'https://github.com/example/repo/pull/1',
  sourceSessionId: 's1',
  status: 'planned',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const artifactDraft: SpaceArtifactDraft = {
  kind: 'pull-request',
  label: '',
  value: '',
  status: 'planned',
  sourceSessionId: '',
}

function renderDialog(
  overrides: Partial<Parameters<typeof SpaceWorkboardDialog>[0]> = {},
) {
  const props: Parameters<typeof SpaceWorkboardDialog>[0] = {
    open: true,
    spaces: [],
    selectedSpace: null,
    selectedDraft: {
      title: '',
      status: 'exploring',
      attention: 'none',
      brief: '',
    },
    selectedAttempts: [],
    selectedArtifacts: [],
    artifactSuggestions: [],
    synthesisPreview: null,
    artifactDraft,
    artifactDialogOpen: false,
    createTitle: '',
    attemptCounts: {},
    artifactCounts: {},
    isLoading: false,
    isCreating: false,
    isSaving: false,
    isCreatingArtifact: false,
    isDiscoveringArtifacts: false,
    isSynthesizing: false,
    error: null,
    onOpenChange: vi.fn(),
    onCreateTitleChange: vi.fn(),
    onCreate: vi.fn(),
    onSelectSpace: vi.fn(),
    onDraftChange: vi.fn(),
    onSave: vi.fn(),
    onArtifactDraftChange: vi.fn(),
    onArtifactDialogOpenChange: vi.fn(),
    onCreateArtifact: vi.fn(),
    onArtifactKindChange: vi.fn(),
    onArtifactStatusChange: vi.fn(),
    onArtifactSourceSessionChange: vi.fn(),
    onArtifactLabelCommit: vi.fn(),
    onArtifactValueCommit: vi.fn(),
    onDeleteArtifact: vi.fn(),
    onDiscoverArtifacts: vi.fn(),
    onAcceptArtifactSuggestion: vi.fn(),
    onDismissArtifactSuggestion: vi.fn(),
    onSynthesize: vi.fn(),
    onSynthesisBriefChange: vi.fn(),
    onAcceptSynthesisBrief: vi.fn(),
    onRejectSynthesisBrief: vi.fn(),
    onAppendSynthesisNotes: vi.fn(),
    onAcceptSynthesisArtifact: vi.fn(),
    onDismissSynthesisPreview: vi.fn(),
    onAttemptRoleChange: vi.fn(),
    onSetPrimaryAttempt: vi.fn(),
    onDetachAttempt: vi.fn(),
    ...overrides,
  }

  render(<SpaceWorkboardDialog {...props} />)
  return props
}

describe('SpaceWorkboardDialog', () => {
  it('renders the empty state', () => {
    renderDialog()

    expect(screen.getByText('No Spaces yet.')).toBeInTheDocument()
    expect(screen.getByText('Select or create a Space.')).toBeInTheDocument()
  })

  it('creates a Space with a title', () => {
    const props = renderDialog({ createTitle: 'New artifact flow' })

    fireEvent.click(screen.getByRole('button', { name: /create space/i }))

    expect(props.onCreate).toHaveBeenCalled()
  })

  it('selects and edits a Space', () => {
    const props = renderDialog({
      spaces: [space],
      selectedSpace: space,
      selectedDraft: draft,
      attemptCounts: { i1: 2 },
      artifactCounts: { i1: 1 },
    })

    fireEvent.click(
      screen.getByRole('button', { name: /agent-native work tracking/i }),
    )
    fireEvent.change(screen.getByDisplayValue(space.title), {
      target: { value: 'Spaces V1' },
    })
    selectOption('Status', 'Implementing')
    selectOption('Attention', 'Blocked')
    fireEvent.change(
      screen.getByDisplayValue('Start with a lightweight workboard.'),
      {
        target: { value: 'Build the visible workboard first.' },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(props.onSelectSpace).toHaveBeenCalledWith('i1')
    expect(props.onDraftChange).toHaveBeenCalledWith({
      ...draft,
      title: 'Spaces V1',
    })
    expect(props.onDraftChange).toHaveBeenCalledWith({
      ...draft,
      status: 'implementing',
    })
    expect(props.onDraftChange).toHaveBeenCalledWith({
      ...draft,
      attention: 'blocked',
    })
    expect(props.onDraftChange).toHaveBeenCalledWith({
      ...draft,
      brief: 'Build the visible workboard first.',
    })
    expect(props.onSave).toHaveBeenCalled()
    expect(screen.getAllByText('2')).toHaveLength(2)
    expect(screen.getAllByText('1')).toHaveLength(2)
  })

  it('renders Attempts and emits Attempt actions', () => {
    const props = renderDialog({
      spaces: [space],
      selectedSpace: space,
      selectedDraft: draft,
      selectedAttempts: [attemptView],
      attemptCounts: { i1: 1 },
      artifactCounts: { i1: 0 },
    })

    expect(screen.getAllByText('Implement workboard').length).toBeGreaterThan(0)
    expect(screen.getByText('convergence')).toBeInTheDocument()
    expect(screen.getByText('feat/spaces')).toBeInTheDocument()

    selectOption(/role for implement workboard/i, 'Review')
    fireEvent.click(screen.getByRole('button', { name: /^primary$/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /detach implement workboard/i }),
    )

    expect(props.onAttemptRoleChange).toHaveBeenCalledWith('a1', 'review')
    expect(props.onSetPrimaryAttempt).toHaveBeenCalledWith('a1')
    expect(props.onDetachAttempt).toHaveBeenCalledWith('a1')
  })

  it('creates a manual Artifact', () => {
    const props = renderDialog({
      spaces: [space],
      selectedSpace: space,
      selectedDraft: draft,
      selectedAttempts: [attemptView],
      artifactDialogOpen: true,
      artifactDraft: {
        kind: 'branch',
        label: 'Feature branch',
        value: 'feat/spaces',
        status: 'in-progress',
        sourceSessionId: 's1',
      },
      attemptCounts: { i1: 1 },
      artifactCounts: { i1: 0 },
    })

    fireEvent.click(screen.getByRole('button', { name: /create artifact/i }))

    expect(props.onCreateArtifact).toHaveBeenCalled()
  })

  it('renders Artifacts and emits Artifact actions', () => {
    const props = renderDialog({
      spaces: [space],
      selectedSpace: space,
      selectedDraft: draft,
      selectedAttempts: [attemptView],
      selectedArtifacts: [artifact],
      attemptCounts: { i1: 1 },
      artifactCounts: { i1: 1 },
    })

    expect(screen.getByDisplayValue('Public PR')).toBeInTheDocument()
    expect(
      screen.getByDisplayValue('https://github.com/example/repo/pull/1'),
    ).toBeInTheDocument()
    expect(screen.getByText('Source: Implement workboard')).toBeInTheDocument()

    selectOption(/kind for public pr/i, 'Documentation')
    selectOption(/status for public pr/i, 'Ready')
    selectOption(/source for public pr/i, 'No source Attempt')
    fireEvent.blur(screen.getByLabelText(/label for public pr/i), {
      target: { value: 'Implementation PR' },
    })
    fireEvent.blur(screen.getByLabelText(/value for public pr/i), {
      target: { value: 'https://github.com/example/repo/pull/2' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /remove artifact public pr/i }),
    )

    expect(props.onArtifactKindChange).toHaveBeenCalledWith(
      'o1',
      'documentation',
    )
    expect(props.onArtifactStatusChange).toHaveBeenCalledWith('o1', 'ready')
    expect(props.onArtifactSourceSessionChange).toHaveBeenCalledWith('o1', '')
    expect(props.onArtifactLabelCommit).toHaveBeenCalledWith(
      'o1',
      'Implementation PR',
    )
    expect(props.onArtifactValueCommit).toHaveBeenCalledWith(
      'o1',
      'https://github.com/example/repo/pull/2',
    )
    expect(props.onDeleteArtifact).toHaveBeenCalledWith('o1')
  })

  it('discovers, accepts, and dismisses suggested Artifacts', () => {
    const props = renderDialog({
      spaces: [space],
      selectedSpace: space,
      selectedDraft: draft,
      selectedAttempts: [attemptView],
      artifactSuggestions: [
        {
          id: 'branch:s1:feat/spaces',
          title: 'Branch feat/spaces',
          description: 'Implement workboard tracking origin/feat/spaces',
          artifact: {
            spaceId: 'i1',
            kind: 'branch',
            label: 'Branch feat/spaces',
            value: 'feat/spaces',
            sourceSessionId: 's1',
            status: 'in-progress',
          },
        },
      ],
      attemptCounts: { i1: 1 },
      artifactCounts: { i1: 0 },
    })

    fireEvent.click(screen.getByRole('button', { name: /discover/i }))
    fireEvent.click(screen.getByRole('button', { name: /accept/i }))
    fireEvent.click(
      screen.getByRole('button', {
        name: /dismiss branch feat\/spaces/i,
      }),
    )

    expect(props.onDiscoverArtifacts).toHaveBeenCalled()
    expect(props.onAcceptArtifactSuggestion).toHaveBeenCalledWith(
      'branch:s1:feat/spaces',
    )
    expect(props.onDismissArtifactSuggestion).toHaveBeenCalledWith(
      'branch:s1:feat/spaces',
    )
  })

  it('renders synthesis suggestions and emits accept/reject actions', () => {
    const props = renderDialog({
      spaces: [space],
      selectedSpace: space,
      selectedDraft: draft,
      selectedAttempts: [attemptView],
      synthesisPreview: {
        brief: 'Use a curated Space summary.',
        decisions: ['Keep suggestions transient.'],
        openQuestions: ['Should decisions become persisted later?'],
        nextAction: 'Save the accepted understanding.',
        artifacts: [
          {
            id: 'synthesis-artifact-1',
            kind: 'documentation',
            label: 'Implementation notes',
            value: 'docs/spaces/notes.md',
            status: 'ready',
            sourceSessionId: 's1',
          },
        ],
      },
      attemptCounts: { i1: 1 },
      artifactCounts: { i1: 0 },
    })

    fireEvent.click(screen.getByRole('button', { name: /synthesize/i }))
    fireEvent.change(screen.getByLabelText(/suggested space brief/i), {
      target: { value: 'Edited suggested understanding.' },
    })
    const acceptButtons = screen.getAllByRole('button', { name: /accept/i })
    fireEvent.click(acceptButtons[0])
    fireEvent.click(
      screen.getByRole('button', {
        name: /append to space brief/i,
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: /^reject$/i }))
    fireEvent.click(screen.getByRole('button', { name: /dismiss synthesis/i }))
    fireEvent.click(acceptButtons[1])

    expect(props.onSynthesize).toHaveBeenCalled()
    expect(props.onSynthesisBriefChange).toHaveBeenCalledWith(
      'Edited suggested understanding.',
    )
    expect(props.onAcceptSynthesisBrief).toHaveBeenCalled()
    expect(props.onAppendSynthesisNotes).toHaveBeenCalled()
    expect(props.onRejectSynthesisBrief).toHaveBeenCalled()
    expect(props.onDismissSynthesisPreview).toHaveBeenCalled()
    expect(props.onAcceptSynthesisArtifact).toHaveBeenCalledWith(
      'synthesis-artifact-1',
    )
  })
})
