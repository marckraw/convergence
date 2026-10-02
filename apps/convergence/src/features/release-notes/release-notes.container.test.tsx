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

    fireEvent.click(screen.getByRole('button', { name: /^Release notes/ }))

    expect(
      screen.getByRole('dialog', { name: 'Release notes' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/version \d+\.\d+\.\d+/i)).toBeInTheDocument()
    expect(screen.getAllByText(/development build/i).length).toBeGreaterThan(0)
  })

  // A dialog you read and leave has no footer (R6, DS4): its ✕ closes it.
  it('closes the dialog from its close button, with no footer', () => {
    render(<ReleaseNotesDialogContainer />)

    fireEvent.click(screen.getByRole('button', { name: /^Release notes/ }))
    expect(document.querySelector('[data-slot="dialog-footer"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(
      screen.queryByRole('dialog', { name: 'Release notes' }),
    ).not.toBeInTheDocument()
  })

  it('pages the release history under the history it pages', () => {
    render(<ReleaseNotesDialogContainer />)

    fireEvent.click(screen.getByRole('button', { name: /^Release notes/ }))

    const notes = within(screen.getByRole('region', { name: 'Release notes' }))
    expect(
      notes.getByLabelText('Release history pagination'),
    ).toBeInTheDocument()
    expect(notes.getByRole('button', { name: /previous/i })).toBeDisabled()
    expect(notes.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })

  it('opens when useDialogStore.open() is called with the release-notes kind', () => {
    render(<ReleaseNotesDialogContainer />)

    expect(
      screen.queryByRole('dialog', { name: 'Release notes' }),
    ).not.toBeInTheDocument()

    act(() => {
      useDialogStore.getState().open('release-notes')
    })

    expect(
      screen.getByRole('dialog', { name: 'Release notes' }),
    ).toBeInTheDocument()
  })

  it('closes when useDialogStore.close() is called', () => {
    render(<ReleaseNotesDialogContainer />)

    act(() => {
      useDialogStore.getState().open('release-notes')
    })
    expect(
      screen.getByRole('dialog', { name: 'Release notes' }),
    ).toBeInTheDocument()

    act(() => {
      useDialogStore.getState().close()
    })

    expect(
      screen.queryByRole('dialog', { name: 'Release notes' }),
    ).not.toBeInTheDocument()
  })
})
