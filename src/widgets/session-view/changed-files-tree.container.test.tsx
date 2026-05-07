import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChangedFilesTree } from './changed-files-tree.container'

const treeModel = vi.hoisted(() => {
  return {
    mountCount: 0,
    renderInstances: [] as number[],
  }
})

vi.mock('./changed-files-tree-model.container', async () => {
  const React = await vi.importActual<typeof import('react')>('react')

  return {
    ChangedFilesTreeModel: () => {
      const [instanceId] = React.useState(() => {
        treeModel.mountCount += 1
        return treeModel.mountCount
      })
      treeModel.renderInstances.push(instanceId)
      return <div aria-label="Changed files" />
    },
  }
})

describe('ChangedFilesTree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    treeModel.mountCount = 0
    treeModel.renderInstances = []
  })

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

  it('does not remount the Pierre tree when selected file changes', () => {
    const files = [
      { status: 'M', file: 'src/app.ts' },
      { status: 'A', file: 'src/new.ts' },
    ]
    const { rerender } = render(
      <ChangedFilesTree files={files} selectedFile={null} />,
    )

    rerender(<ChangedFilesTree files={files} selectedFile="src/app.ts" />)

    expect(treeModel.mountCount).toBe(1)
    expect(treeModel.renderInstances).toEqual([1, 1])
  })
})
