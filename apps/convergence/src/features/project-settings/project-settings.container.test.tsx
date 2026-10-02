import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { UiProvider } from '@convergence/ui'
import { useDialogStore } from '@/entities/dialog'
import {
  DEFAULT_PROJECT_SETTINGS,
  useProjectStore,
  type Project,
} from '@/entities/project'
import { answerConfirm } from '@/shared/testing/confirm'
import { ProjectSettingsDialogContainer } from './project-settings.container'

const project: Project = {
  id: 'p1',
  name: 'convergence',
  repositoryPath: '/Users/marcin/Projects/convergence',
  settings: DEFAULT_PROJECT_SETTINGS,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  laneOf: null,
  laneName: null,
}

/**
 * The project's settings open, with a stand-in for the context items whose
 * button starts an edit, as the item editor reports one.
 */
function renderOpen() {
  render(
    <UiProvider>
      <ProjectSettingsDialogContainer
        contextSection={(_projectId, onDraftChange) => (
          <button type="button" onClick={() => onDraftChange(true)}>
            Edit a context item
          </button>
        )}
      />
    </UiProvider>,
  )
  act(() => {
    useDialogStore.getState().open('project-settings')
  })
  return screen.getByRole('dialog', { name: 'Project settings' })
}

const isOpen = () => useDialogStore.getState().openDialog === 'project-settings'

describe('ProjectSettingsDialogContainer', () => {
  beforeEach(() => {
    useDialogStore.getState().close()
    useProjectStore.setState({
      activeProject: project,
      updateProjectSettings: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('closes on Done when no context item is being edited', async () => {
    const dialog = renderOpen()

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    })

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(isOpen()).toBe(false)
  })

  it('asks before Done drops a context item’s unsaved edit (DLG-10)', async () => {
    const dialog = renderOpen()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Edit a context item' }),
    )

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    })
    // Mutation: close without asking -> no question, and the dialog is gone.
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Discard the context item you’re editing?',
    )
    await answerConfirm('Keep editing')
    expect(isOpen()).toBe(true)

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    })
    await answerConfirm('Discard')
    expect(isOpen()).toBe(false)
  })
})
