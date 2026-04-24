import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type {
  Initiative,
  InitiativeAttempt,
  InitiativeOutput,
} from '@/entities/initiative'
import { InitiativeWorkboardDialog } from './initiative-workboard.presentational'
import type {
  InitiativeAttemptView,
  InitiativeDraft,
  InitiativeOutputDraft,
} from './initiative-workboard.presentational'

const initiative: Initiative = {
  id: 'i1',
  title: 'Agent-native work tracking',
  status: 'exploring',
  attention: 'needs-decision',
  currentUnderstanding: 'Start with a lightweight workboard.',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T12:00:00.000Z',
}

const draft: InitiativeDraft = {
  title: initiative.title,
  status: initiative.status,
  currentUnderstanding: initiative.currentUnderstanding,
}

const attempt: InitiativeAttempt = {
  id: 'a1',
  initiativeId: 'i1',
  sessionId: 's1',
  role: 'implementation',
  isPrimary: false,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const attemptView: InitiativeAttemptView = {
  attempt,
  sessionName: 'Implement workboard',
  projectName: 'convergence',
  branchName: 'feat/initiatives',
  providerId: 'codex',
  status: 'completed',
  attention: 'finished',
  missing: false,
}

const output: InitiativeOutput = {
  id: 'o1',
  initiativeId: 'i1',
  kind: 'pull-request',
  label: 'Public PR',
  value: 'https://github.com/example/repo/pull/1',
  sourceSessionId: 's1',
  status: 'planned',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const outputDraft: InitiativeOutputDraft = {
  kind: 'pull-request',
  label: '',
  value: '',
  status: 'planned',
  sourceSessionId: '',
}

function renderDialog(
  overrides: Partial<Parameters<typeof InitiativeWorkboardDialog>[0]> = {},
) {
  const props: Parameters<typeof InitiativeWorkboardDialog>[0] = {
    open: true,
    initiatives: [],
    selectedInitiative: null,
    selectedDraft: { title: '', status: 'exploring', currentUnderstanding: '' },
    selectedAttempts: [],
    selectedOutputs: [],
    outputDraft,
    outputDialogOpen: false,
    createTitle: '',
    attemptCounts: {},
    outputCounts: {},
    isLoading: false,
    isCreating: false,
    isSaving: false,
    isCreatingOutput: false,
    error: null,
    onOpenChange: vi.fn(),
    onCreateTitleChange: vi.fn(),
    onCreate: vi.fn(),
    onSelectInitiative: vi.fn(),
    onDraftChange: vi.fn(),
    onSave: vi.fn(),
    onOutputDraftChange: vi.fn(),
    onOutputDialogOpenChange: vi.fn(),
    onCreateOutput: vi.fn(),
    onOutputKindChange: vi.fn(),
    onOutputStatusChange: vi.fn(),
    onOutputSourceSessionChange: vi.fn(),
    onOutputLabelCommit: vi.fn(),
    onOutputValueCommit: vi.fn(),
    onDeleteOutput: vi.fn(),
    onAttemptRoleChange: vi.fn(),
    onSetPrimaryAttempt: vi.fn(),
    onDetachAttempt: vi.fn(),
    ...overrides,
  }

  render(<InitiativeWorkboardDialog {...props} />)
  return props
}

describe('InitiativeWorkboardDialog', () => {
  it('renders the empty state', () => {
    renderDialog()

    expect(screen.getByText('No Initiatives yet.')).toBeInTheDocument()
    expect(
      screen.getByText('Select or create an Initiative.'),
    ).toBeInTheDocument()
  })

  it('creates an Initiative with a title', () => {
    const props = renderDialog({ createTitle: 'New output flow' })

    fireEvent.click(screen.getByRole('button', { name: /create initiative/i }))

    expect(props.onCreate).toHaveBeenCalled()
  })

  it('selects and edits an Initiative', () => {
    const props = renderDialog({
      initiatives: [initiative],
      selectedInitiative: initiative,
      selectedDraft: draft,
      attemptCounts: { i1: 2 },
      outputCounts: { i1: 1 },
    })

    fireEvent.click(
      screen.getByRole('button', { name: /agent-native work tracking/i }),
    )
    fireEvent.change(screen.getByDisplayValue(initiative.title), {
      target: { value: 'Initiatives V1' },
    })
    fireEvent.change(screen.getByDisplayValue('Exploring'), {
      target: { value: 'implementing' },
    })
    fireEvent.change(
      screen.getByDisplayValue('Start with a lightweight workboard.'),
      {
        target: { value: 'Build the visible workboard first.' },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(props.onSelectInitiative).toHaveBeenCalledWith('i1')
    expect(props.onDraftChange).toHaveBeenCalledWith({
      ...draft,
      title: 'Initiatives V1',
    })
    expect(props.onDraftChange).toHaveBeenCalledWith({
      ...draft,
      status: 'implementing',
    })
    expect(props.onDraftChange).toHaveBeenCalledWith({
      ...draft,
      currentUnderstanding: 'Build the visible workboard first.',
    })
    expect(props.onSave).toHaveBeenCalled()
    expect(screen.getAllByText('2')).toHaveLength(2)
    expect(screen.getAllByText('1')).toHaveLength(2)
  })

  it('renders Attempts and emits Attempt actions', () => {
    const props = renderDialog({
      initiatives: [initiative],
      selectedInitiative: initiative,
      selectedDraft: draft,
      selectedAttempts: [attemptView],
      attemptCounts: { i1: 1 },
      outputCounts: { i1: 0 },
    })

    expect(screen.getAllByText('Implement workboard').length).toBeGreaterThan(0)
    expect(screen.getByText('convergence')).toBeInTheDocument()
    expect(screen.getByText('feat/initiatives')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/role for implement workboard/i), {
      target: { value: 'review' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^primary$/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /detach implement workboard/i }),
    )

    expect(props.onAttemptRoleChange).toHaveBeenCalledWith('a1', 'review')
    expect(props.onSetPrimaryAttempt).toHaveBeenCalledWith('a1')
    expect(props.onDetachAttempt).toHaveBeenCalledWith('a1')
  })

  it('creates a manual Output', () => {
    const props = renderDialog({
      initiatives: [initiative],
      selectedInitiative: initiative,
      selectedDraft: draft,
      selectedAttempts: [attemptView],
      outputDialogOpen: true,
      outputDraft: {
        kind: 'branch',
        label: 'Feature branch',
        value: 'feat/initiatives',
        status: 'in-progress',
        sourceSessionId: 's1',
      },
      attemptCounts: { i1: 1 },
      outputCounts: { i1: 0 },
    })

    fireEvent.click(screen.getByRole('button', { name: /create output/i }))

    expect(props.onCreateOutput).toHaveBeenCalled()
  })

  it('renders Outputs and emits Output actions', () => {
    const props = renderDialog({
      initiatives: [initiative],
      selectedInitiative: initiative,
      selectedDraft: draft,
      selectedAttempts: [attemptView],
      selectedOutputs: [output],
      attemptCounts: { i1: 1 },
      outputCounts: { i1: 1 },
    })

    expect(screen.getByDisplayValue('Public PR')).toBeInTheDocument()
    expect(
      screen.getByDisplayValue('https://github.com/example/repo/pull/1'),
    ).toBeInTheDocument()
    expect(screen.getByText('Source: Implement workboard')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/kind for public pr/i), {
      target: { value: 'documentation' },
    })
    fireEvent.change(screen.getByLabelText(/status for public pr/i), {
      target: { value: 'ready' },
    })
    fireEvent.change(screen.getByLabelText(/source for public pr/i), {
      target: { value: '' },
    })
    fireEvent.blur(screen.getByLabelText(/label for public pr/i), {
      target: { value: 'Implementation PR' },
    })
    fireEvent.blur(screen.getByLabelText(/value for public pr/i), {
      target: { value: 'https://github.com/example/repo/pull/2' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /remove output public pr/i }),
    )

    expect(props.onOutputKindChange).toHaveBeenCalledWith('o1', 'documentation')
    expect(props.onOutputStatusChange).toHaveBeenCalledWith('o1', 'ready')
    expect(props.onOutputSourceSessionChange).toHaveBeenCalledWith('o1', '')
    expect(props.onOutputLabelCommit).toHaveBeenCalledWith(
      'o1',
      'Implementation PR',
    )
    expect(props.onOutputValueCommit).toHaveBeenCalledWith(
      'o1',
      'https://github.com/example/repo/pull/2',
    )
    expect(props.onDeleteOutput).toHaveBeenCalledWith('o1')
  })
})
