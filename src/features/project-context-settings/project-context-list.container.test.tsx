import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useProjectContextStore } from '@/entities/project-context'
import type { ProjectContextItem } from '@/entities/project-context'
import { ProjectContextSettings } from './project-context-list.container'

const PROJECT_ID = 'p1'

const itemA: ProjectContextItem = {
  id: 'ctx-a',
  projectId: PROJECT_ID,
  label: 'monorepo',
  body: 'See ~/work/monorepo for the API contract.',
  reinjectMode: 'boot',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const itemB: ProjectContextItem = {
  id: 'ctx-b',
  projectId: PROJECT_ID,
  label: null,
  body: 'Always run npm test before claiming done.',
  reinjectMode: 'every-turn',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

const mockElectronAPI = {
  projectContext: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    attachToSession: vi.fn(),
    listForSession: vi.fn(),
  },
}

describe('ProjectContextSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'electronAPI', {
      value: mockElectronAPI,
      writable: true,
      configurable: true,
    })
    useProjectContextStore.setState({
      itemsByProjectId: {},
      attachmentsBySessionId: {},
      loading: false,
      error: null,
    })
    mockElectronAPI.projectContext.list.mockResolvedValue([itemA, itemB])
  })

  it('loads items for the project on mount and renders them with badges', async () => {
    render(<ProjectContextSettings projectId={PROJECT_ID} />)

    await waitFor(() => {
      expect(
        screen.getByTestId(`project-context-item-${itemA.id}`),
      ).toBeTruthy()
      expect(
        screen.getByTestId(`project-context-item-${itemB.id}`),
      ).toBeTruthy()
    })
    expect(screen.getByText('monorepo')).toBeTruthy()
    expect(screen.getByText('Untitled')).toBeTruthy()
    expect(screen.getByText('Boot')).toBeTruthy()
    expect(screen.getByText('Every turn')).toBeTruthy()
  })

  it('renders the empty-state copy when no items exist', async () => {
    mockElectronAPI.projectContext.list.mockResolvedValue([])
    render(<ProjectContextSettings projectId={PROJECT_ID} />)

    await waitFor(() => {
      expect(screen.getByText(/No context items yet/i)).toBeTruthy()
    })
  })

  it('opens the form on Add and shows the every-turn warning when toggled on', async () => {
    mockElectronAPI.projectContext.list.mockResolvedValue([])
    render(<ProjectContextSettings projectId={PROJECT_ID} />)

    await waitFor(() => {
      expect(screen.getByText(/No context items yet/i)).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /add/i }))

    expect(screen.getByTestId('project-context-form')).toBeTruthy()
    expect(screen.queryByTestId('every-turn-warning')).toBeNull()

    fireEvent.click(screen.getByRole('switch'))
    expect(screen.getByTestId('every-turn-warning')).toBeTruthy()
  })

  it('creates a new item via the form', async () => {
    mockElectronAPI.projectContext.list.mockResolvedValue([])
    const created: ProjectContextItem = {
      ...itemA,
      id: 'ctx-new',
      label: 'new-thing',
      body: 'new body',
    }
    mockElectronAPI.projectContext.create.mockResolvedValue(created)

    render(<ProjectContextSettings projectId={PROJECT_ID} />)

    await waitFor(() => {
      expect(screen.getByText(/No context items yet/i)).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /add/i }))
    fireEvent.change(screen.getByLabelText(/Label/i), {
      target: { value: 'new-thing' },
    })
    fireEvent.change(screen.getByLabelText(/Body/i), {
      target: { value: 'new body' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Add context item/i }))

    await waitFor(() => {
      expect(mockElectronAPI.projectContext.create).toHaveBeenCalledWith({
        projectId: PROJECT_ID,
        label: 'new-thing',
        body: 'new body',
        reinjectMode: 'boot',
      })
    })

    await waitFor(() => {
      expect(screen.queryByTestId('project-context-form')).toBeNull()
    })
  })

  it('opens an edit form prefilled with the item values and saves changes', async () => {
    mockElectronAPI.projectContext.update.mockResolvedValue({
      ...itemA,
      body: 'updated body',
    })

    render(<ProjectContextSettings projectId={PROJECT_ID} />)

    await waitFor(() => {
      expect(
        screen.getByTestId(`project-context-item-${itemA.id}`),
      ).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Edit monorepo/i }))

    const labelInput = screen.getByLabelText(/Label/i) as HTMLInputElement
    const bodyInput = screen.getByLabelText(/Body/i) as HTMLTextAreaElement
    expect(labelInput.value).toBe(itemA.label)
    expect(bodyInput.value).toBe(itemA.body)

    fireEvent.change(bodyInput, { target: { value: 'updated body' } })
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }))

    await waitFor(() => {
      expect(mockElectronAPI.projectContext.update).toHaveBeenCalledWith(
        itemA.id,
        {
          label: itemA.label,
          body: 'updated body',
          reinjectMode: 'boot',
        },
      )
    })
  })

  it('asks for confirmation before deleting and dispatches on confirm', async () => {
    mockElectronAPI.projectContext.delete.mockResolvedValue(undefined)

    render(<ProjectContextSettings projectId={PROJECT_ID} />)

    await waitFor(() => {
      expect(
        screen.getByTestId(`project-context-item-${itemA.id}`),
      ).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Delete monorepo/i }))

    expect(
      screen.getByTestId(`project-context-delete-confirm-${itemA.id}`),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }))

    await waitFor(() => {
      expect(mockElectronAPI.projectContext.delete).toHaveBeenCalledWith(
        itemA.id,
      )
    })
  })

  it('cancels the delete confirmation without dispatching', async () => {
    render(<ProjectContextSettings projectId={PROJECT_ID} />)

    await waitFor(() => {
      expect(
        screen.getByTestId(`project-context-item-${itemA.id}`),
      ).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Delete monorepo/i }))
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))

    expect(
      screen.queryByTestId(`project-context-delete-confirm-${itemA.id}`),
    ).toBeNull()
    expect(mockElectronAPI.projectContext.delete).not.toHaveBeenCalled()
  })
})
