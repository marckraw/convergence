import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDialogStore } from '@/entities/dialog'
import { ReleaseNotesDialogContainer } from './release-notes.container'

describe('ReleaseNotesDialogContainer', () => {
  beforeEach(() => {
    useDialogStore.setState({ openDialog: null })
  })

  it('opens the bundled release notes dialog', () => {
    render(<ReleaseNotesDialogContainer />)

    fireEvent.click(screen.getByRole('button', { name: /what's new/i }))

    expect(screen.getByText('About Convergence')).toBeInTheDocument()
    expect(screen.getByText(/version \d+\.\d+\.\d+/i)).toBeInTheDocument()
    expect(screen.getAllByText(/development build/i).length).toBeGreaterThan(0)
  })

  it('closes the dialog from the footer button', () => {
    render(<ReleaseNotesDialogContainer />)

    fireEvent.click(screen.getByRole('button', { name: /what's new/i }))
    const footer = document.querySelector('[data-slot="dialog-footer"]')
    expect(footer).not.toBeNull()
    fireEvent.click(within(footer as HTMLElement).getByRole('button'))

    expect(screen.queryByText('About Convergence')).not.toBeInTheDocument()
  })

  it('opens when useDialogStore.open() is called with the release-notes kind', () => {
    render(<ReleaseNotesDialogContainer />)

    expect(screen.queryByText('About Convergence')).not.toBeInTheDocument()

    act(() => {
      useDialogStore.getState().open('release-notes')
    })

    expect(screen.getByText('About Convergence')).toBeInTheDocument()
  })

  it('closes when useDialogStore.close() is called', () => {
    render(<ReleaseNotesDialogContainer />)

    act(() => {
      useDialogStore.getState().open('release-notes')
    })
    expect(screen.getByText('About Convergence')).toBeInTheDocument()

    act(() => {
      useDialogStore.getState().close()
    })

    expect(screen.queryByText('About Convergence')).not.toBeInTheDocument()
  })
})
