import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReleaseNotesDialogContainer } from './release-notes.container'

describe('ReleaseNotesDialogContainer', () => {
  it('opens the bundled release notes dialog', () => {
    render(<ReleaseNotesDialogContainer />)

    fireEvent.click(screen.getByRole('button', { name: /what's new/i }))

    expect(screen.getByText('About Convergence')).toBeInTheDocument()
    expect(screen.getByText(/version 0\.0\.0/i)).toBeInTheDocument()
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
})
