import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChangedFilesTree } from './changed-files-tree.presentational'

describe('ChangedFilesTree', () => {
  it('renders a loading state without mounting Pierre Tree', () => {
    render(<ChangedFilesTree files={[]} selectedFile={null} loading />)

    expect(screen.getByText('Loading changed files...')).toBeInTheDocument()
  })

  it('renders an empty state without replacing the active changed-files UI', () => {
    render(
      <ChangedFilesTree
        files={[]}
        selectedFile={null}
        emptyMessage="No files changed"
      />,
    )

    expect(screen.getByText('No files changed')).toBeInTheDocument()
  })
})
