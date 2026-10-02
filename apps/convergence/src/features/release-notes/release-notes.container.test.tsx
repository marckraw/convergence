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

    act(() => {
      useDialogStore.getState().open('release-notes')
    })

    expect(screen.getByText('About Convergence')).toBeInTheDocument()
    expect(screen.getByText(/version \d+\.\d+\.\d+/i)).toBeInTheDocument()
    expect(screen.getAllByText(/development build/i).length).toBeGreaterThan(0)
  })

  // A dialog you read and leave has no footer (R6, DS4): its ✕ closes it.
  it('closes the dialog from its close button, with no footer', () => {
    render(<ReleaseNotesDialogContainer />)

    act(() => {
      useDialogStore.getState().open('release-notes')
    })
    expect(document.querySelector('[data-slot="dialog-footer"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByText('About Convergence')).not.toBeInTheDocument()
  })

  it('pages the release history under the history it pages', () => {
    render(<ReleaseNotesDialogContainer />)

    act(() => {
      useDialogStore.getState().open('release-notes')
    })

    const notes = within(screen.getByRole('region', { name: 'Release notes' }))
    expect(
      notes.getByLabelText('Release history pagination'),
    ).toBeInTheDocument()
    expect(notes.getByRole('button', { name: /previous/i })).toBeDisabled()
    expect(notes.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })

  // The sidebar's menus open it through the store, so it draws no trigger of
  // its own, hidden or not (NAV-34). Mutation: bring back a default trigger
  // -> red.
  it('draws no trigger of its own', () => {
    render(<ReleaseNotesDialogContainer />)

    expect(screen.queryAllByRole('button', { hidden: true })).toEqual([])
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
