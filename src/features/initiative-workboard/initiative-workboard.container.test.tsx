import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useDialogStore } from '@/entities/dialog'
import { useInitiativeStore } from '@/entities/initiative'
import type { Initiative } from '@/entities/initiative'
import { InitiativeWorkboardDialogContainer } from './initiative-workboard.container'

const initiative: Initiative = {
  id: 'i1',
  title: 'Agent-native work tracking',
  status: 'exploring',
  attention: 'none',
  currentUnderstanding: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const updatedInitiative: Initiative = {
  ...initiative,
  title: 'Initiatives V1',
  status: 'implementing',
  currentUnderstanding: 'Stable current understanding.',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

const secondInitiative: Initiative = {
  ...initiative,
  id: 'i2',
  title: 'Linked session context',
  currentUnderstanding: 'Show context beside the session.',
}

const mockElectronAPI = {
  initiative: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listAttempts: vi.fn(),
    listAttemptsForSession: vi.fn(),
    linkAttempt: vi.fn(),
    updateAttempt: vi.fn(),
    unlinkAttempt: vi.fn(),
    setPrimaryAttempt: vi.fn(),
    listOutputs: vi.fn(),
    addOutput: vi.fn(),
    updateOutput: vi.fn(),
    deleteOutput: vi.fn(),
  },
}

describe('InitiativeWorkboardDialogContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'electronAPI', {
      value: mockElectronAPI,
      writable: true,
      configurable: true,
    })
    mockElectronAPI.initiative.list.mockResolvedValue([initiative])
    mockElectronAPI.initiative.listAttempts.mockResolvedValue([])
    mockElectronAPI.initiative.listOutputs.mockResolvedValue([])
    mockElectronAPI.initiative.create.mockResolvedValue(initiative)
    mockElectronAPI.initiative.update.mockResolvedValue(updatedInitiative)
    useDialogStore.setState({ openDialog: null, payload: null })
    useInitiativeStore.setState({
      initiatives: [],
      attemptsByInitiativeId: {},
      outputsByInitiativeId: {},
      loading: false,
      error: null,
    })
  })

  it('loads Initiatives when opened', async () => {
    render(<InitiativeWorkboardDialogContainer />)

    fireEvent.click(screen.getByRole('button', { name: /initiatives/i }))

    await waitFor(() => {
      expect(mockElectronAPI.initiative.list).toHaveBeenCalled()
    })
    expect(
      await screen.findByText('Agent-native work tracking'),
    ).toBeInTheDocument()
  })

  it('creates and selects an Initiative', async () => {
    mockElectronAPI.initiative.list.mockResolvedValue([])
    render(<InitiativeWorkboardDialogContainer />)

    fireEvent.click(screen.getByRole('button', { name: /initiatives/i }))
    fireEvent.change(screen.getByLabelText(/new initiative title/i), {
      target: { value: 'Agent-native work tracking' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create initiative/i }))

    await waitFor(() => {
      expect(mockElectronAPI.initiative.create).toHaveBeenCalledWith({
        title: 'Agent-native work tracking',
      })
    })
    expect(
      screen.getByDisplayValue('Agent-native work tracking'),
    ).toBeInTheDocument()
  })

  it('saves stable Initiative fields', async () => {
    render(<InitiativeWorkboardDialogContainer />)

    fireEvent.click(screen.getByRole('button', { name: /initiatives/i }))
    await screen.findByText('Agent-native work tracking')
    fireEvent.change(screen.getByDisplayValue('Agent-native work tracking'), {
      target: { value: 'Initiatives V1' },
    })
    fireEvent.change(screen.getByDisplayValue('Exploring'), {
      target: { value: 'implementing' },
    })
    fireEvent.change(
      screen.getByPlaceholderText(
        /stable notes, decisions, constraints, and next action/i,
      ),
      { target: { value: 'Stable current understanding.' } },
    )
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(mockElectronAPI.initiative.update).toHaveBeenCalledWith('i1', {
        title: 'Initiatives V1',
        status: 'implementing',
        currentUnderstanding: 'Stable current understanding.',
      })
    })
  })

  it('opens focused on a payload Initiative id', async () => {
    mockElectronAPI.initiative.list.mockResolvedValue([
      initiative,
      secondInitiative,
    ])
    useDialogStore.setState({
      openDialog: 'initiative-workboard',
      payload: { initiativeId: 'i2' },
    })

    render(<InitiativeWorkboardDialogContainer />)

    expect(
      await screen.findByDisplayValue('Linked session context'),
    ).toBeInTheDocument()
    expect(
      screen.getByDisplayValue('Show context beside the session.'),
    ).toBeInTheDocument()
  })
})
