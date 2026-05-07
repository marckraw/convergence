import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChangedFilesTreeModel } from './changed-files-tree-model.container'
import type { PierreChangedFilesTreeInput } from './changed-files-tree.pure'

const pierreTree = vi.hoisted(() => {
  const itemHandles = new Map<
    string,
    {
      deselect: ReturnType<typeof vi.fn>
      focus: ReturnType<typeof vi.fn>
      select: ReturnType<typeof vi.fn>
    }
  >()
  let selectedPaths: string[] = []
  const searchState = {
    isOpen: false,
    matchingPaths: [] as string[],
    value: '',
    close: vi.fn(),
    focusNextMatch: vi.fn(),
    focusPreviousMatch: vi.fn(),
    open: vi.fn(),
    setValue: vi.fn(),
  }
  const model = {
    getItem: vi.fn((path: string) => itemHandles.get(path) ?? null),
    getSelectedPaths: vi.fn(() => selectedPaths),
  }

  function createItemHandle(path: string) {
    const handle = {
      deselect: vi.fn(() => {
        selectedPaths = selectedPaths.filter(
          (selectedPath) => selectedPath !== path,
        )
      }),
      focus: vi.fn(),
      select: vi.fn(() => {
        if (!selectedPaths.includes(path)) {
          selectedPaths = [...selectedPaths, path]
        }
      }),
    }
    itemHandles.set(path, handle)
    return handle
  }

  return {
    createItemHandle,
    itemHandles,
    model,
    setSelectedPaths(paths: string[]) {
      selectedPaths = paths
    },
    searchState,
    useFileTree: vi.fn(() => ({ model })),
    useFileTreeSearch: vi.fn(() => searchState),
  }
})

vi.mock('@pierre/trees/react', () => ({
  FileTree: () => <div aria-label="Changed files" />,
  useFileTree: pierreTree.useFileTree,
  useFileTreeSearch: pierreTree.useFileTreeSearch,
}))

const treeInput: PierreChangedFilesTreeInput = {
  paths: ['src/app.ts', 'src/components/very-long-review-file-name.tsx'],
  gitStatus: [
    { path: 'src/app.ts', status: 'modified' },
    {
      path: 'src/components/very-long-review-file-name.tsx',
      status: 'added',
    },
  ],
  noteCountsByPath: new Map([['src/app.ts', 2]]),
}

describe('ChangedFilesTreeModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pierreTree.itemHandles.clear()
    pierreTree.setSelectedPaths([])
    pierreTree.createItemHandle('src/app.ts')
    pierreTree.createItemHandle('src/components/very-long-review-file-name.tsx')
    pierreTree.searchState.isOpen = false
    pierreTree.searchState.matchingPaths = []
    pierreTree.searchState.value = ''
  })

  it('configures Pierre tree for compact read-only review navigation', () => {
    render(
      <ChangedFilesTreeModel
        treeInput={treeInput}
        selectedFile="src/app.ts"
        onSelectFile={vi.fn()}
      />,
    )

    expect(pierreTree.useFileTree).toHaveBeenCalledWith(
      expect.objectContaining({
        density: 'compact',
        fileTreeSearchMode: 'hide-non-matches',
        flattenEmptyDirectories: true,
        gitStatus: treeInput.gitStatus,
        initialSelectedPaths: ['src/app.ts'],
        paths: treeInput.paths,
        search: true,
        searchBlurBehavior: 'retain',
      }),
    )
  })

  it('syncs selected file through the mounted Pierre tree model', () => {
    const { rerender } = render(
      <ChangedFilesTreeModel
        treeInput={treeInput}
        selectedFile={null}
        onSelectFile={vi.fn()}
      />,
    )

    rerender(
      <ChangedFilesTreeModel
        treeInput={treeInput}
        selectedFile="src/app.ts"
        onSelectFile={vi.fn()}
      />,
    )

    const selectedHandle = pierreTree.itemHandles.get('src/app.ts')
    expect(selectedHandle?.select).toHaveBeenCalledTimes(1)
    expect(selectedHandle?.focus).toHaveBeenCalledTimes(1)
  })

  it('clears previous external tree selection before selecting a new file', () => {
    pierreTree.setSelectedPaths(['src/app.ts'])

    render(
      <ChangedFilesTreeModel
        treeInput={treeInput}
        selectedFile="src/components/very-long-review-file-name.tsx"
        onSelectFile={vi.fn()}
      />,
    )

    expect(
      pierreTree.itemHandles.get('src/app.ts')?.deselect,
    ).toHaveBeenCalled()
    expect(
      pierreTree.itemHandles.get(
        'src/components/very-long-review-file-name.tsx',
      )?.select,
    ).toHaveBeenCalled()
  })

  it('opens search from the compact control', () => {
    pierreTree.searchState.isOpen = false

    render(
      <ChangedFilesTreeModel
        treeInput={treeInput}
        selectedFile={null}
        onSelectFile={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Search changed files' }),
    )

    expect(pierreTree.searchState.open).toHaveBeenCalledWith('')
  })

  it('supports keyboard search navigation and close', () => {
    pierreTree.searchState.isOpen = true
    pierreTree.searchState.value = 'app'
    pierreTree.searchState.matchingPaths = ['src/app.ts']

    render(
      <ChangedFilesTreeModel
        treeInput={treeInput}
        selectedFile={null}
        onSelectFile={vi.fn()}
      />,
    )

    const input = screen.getByLabelText('Search changed files')
    fireEvent.change(input, { target: { value: 'session' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(pierreTree.searchState.setValue).toHaveBeenCalledWith('session')
    expect(pierreTree.searchState.focusNextMatch).toHaveBeenCalled()
    expect(pierreTree.searchState.focusPreviousMatch).toHaveBeenCalled()
    expect(pierreTree.searchState.setValue).toHaveBeenCalledWith(null)
    expect(pierreTree.searchState.close).toHaveBeenCalled()
  })
})
