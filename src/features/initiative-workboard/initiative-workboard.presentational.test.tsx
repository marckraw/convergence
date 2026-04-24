import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Initiative } from '@/entities/initiative'
import { InitiativeWorkboardDialog } from './initiative-workboard.presentational'
import type { InitiativeDraft } from './initiative-workboard.presentational'

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

function renderDialog(
  overrides: Partial<Parameters<typeof InitiativeWorkboardDialog>[0]> = {},
) {
  const props: Parameters<typeof InitiativeWorkboardDialog>[0] = {
    open: true,
    initiatives: [],
    selectedInitiative: null,
    selectedDraft: { title: '', status: 'exploring', currentUnderstanding: '' },
    createTitle: '',
    attemptCounts: {},
    outputCounts: {},
    isLoading: false,
    isCreating: false,
    isSaving: false,
    error: null,
    onOpenChange: vi.fn(),
    onCreateTitleChange: vi.fn(),
    onCreate: vi.fn(),
    onSelectInitiative: vi.fn(),
    onDraftChange: vi.fn(),
    onSave: vi.fn(),
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
})
