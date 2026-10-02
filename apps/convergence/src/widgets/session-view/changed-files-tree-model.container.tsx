import type { CSSProperties, FC, KeyboardEvent } from 'react'
import { useEffect, useMemo, useReducer, useRef } from 'react'
import {
  FileTree as PierreFileTreeModel,
  type FileTreeRowDecorationRenderer,
} from '@pierre/trees'
import { FileTree, useFileTreeSearch } from '@pierre/trees/react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { IconButton, Input } from '@convergence/ui'
import type { PierreChangedFilesTreeInput } from './changed-files-tree.pure'

interface ChangedFilesTreeModelProps {
  treeInput: PierreChangedFilesTreeInput
  selectedFile: string | null
  search?: boolean
  onSelectFile?: (file: string) => void
}

export const ChangedFilesTreeModel: FC<ChangedFilesTreeModelProps> = ({
  treeInput,
  selectedFile,
  search: searchEnabled = true,
  onSelectFile,
}) => {
  const renderRowDecoration = useMemo<FileTreeRowDecorationRenderer>(() => {
    return ({ row }) => {
      const count = treeInput.noteCountsByPath.get(row.path)
      if (!count) return null
      return {
        text: String(count),
        title: `${count} review ${count === 1 ? 'note' : 'notes'}`,
      }
    }
  }, [treeInput.noteCountsByPath])

  const modelRef = useRef<PierreFileTreeModel | null>(null)
  const [, forceUpdate] = useReducer((tick: number) => tick + 1, 0)

  if (modelRef.current == null) {
    modelRef.current = new PierreFileTreeModel({
      paths: treeInput.paths,
      gitStatus: treeInput.gitStatus,
      density: 'compact',
      flattenEmptyDirectories: true,
      initialExpansion: 'open',
      initialSelectedPaths: selectedFile ? [selectedFile] : [],
      fileTreeSearchMode: 'hide-non-matches',
      onSelectionChange: (selectedPaths) => {
        const nextFile = selectedPaths[0]
        if (nextFile) onSelectFile?.(nextFile)
      },
      renderRowDecoration,
      search: searchEnabled,
      searchBlurBehavior: 'retain',
    })
  }
  const model = modelRef.current

  useEffect(() => {
    return () => {
      // React 18 StrictMode dev double-invokes effects: cleanup then re-setup.
      // Pierre's `useFileTree` calls cleanUp() on the simulated unmount but
      // never recreates the model on re-setup, leaving the DOM bound to a
      // dead model with no controller listeners. We replicate the hook here
      // but force a re-render after cleanup so the render-time `??=` builds
      // a fresh model. On real unmount, forceUpdate is a no-op.
      modelRef.current?.cleanUp()
      modelRef.current = null
      forceUpdate()
    }
  }, [])

  const search = useFileTreeSearch(model)

  useEffect(() => {
    const selectedPaths = model.getSelectedPaths()

    if (!selectedFile) {
      for (const path of selectedPaths) {
        model.getItem(path)?.deselect()
      }
      return
    }

    if (selectedPaths.length === 1 && selectedPaths[0] === selectedFile) {
      return
    }

    for (const path of selectedPaths) {
      if (path !== selectedFile) {
        model.getItem(path)?.deselect()
      }
    }

    const selectedItem = model.getItem(selectedFile)
    selectedItem?.select()
    selectedItem?.focus()
  }, [model, selectedFile])

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      search.setValue(null)
      search.close()
      return
    }

    if (event.key === 'Enter') {
      if (event.shiftKey) {
        search.focusPreviousMatch()
      } else {
        search.focusNextMatch()
      }
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {searchEnabled && (
        <div className="flex h-8 shrink-0 items-center gap-1 px-1 pb-1">
          {search.isOpen ? (
            <>
              <Input
                size="sm"
                aria-label="Search changed files"
                className="min-w-0 flex-1 rounded px-2 font-mono text-xs"
                placeholder="Search files"
                value={search.value}
                onChange={(event) => search.setValue(event.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              {search.value && (
                <span className="w-10 text-right text-3xs tabular-nums text-muted-foreground">
                  {search.matchingPaths.length}
                </span>
              )}
              <IconButton
                label="Previous search match"
                type="button"
                variant="ghost"
                size="sm"
                disabled={!search.value || search.matchingPaths.length === 0}
                onClick={search.focusPreviousMatch}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label="Next search match"
                type="button"
                variant="ghost"
                size="sm"
                disabled={!search.value || search.matchingPaths.length === 0}
                onClick={search.focusNextMatch}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label="Close changed-files search"
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  search.setValue(null)
                  search.close()
                }}
              >
                <X className="h-3.5 w-3.5" />
              </IconButton>
            </>
          ) : (
            <IconButton
              label="Search changed files"
              type="button"
              variant="ghost"
              onClick={() => search.open(search.value)}
              size="sm"
              className="ml-auto"
            >
              <Search className="h-3.5 w-3.5" />
            </IconButton>
          )}
        </div>
      )}
      <FileTree
        className="min-h-0 w-full flex-1"
        model={model}
        aria-label="Changed files"
        style={TREE_HOST_STYLE}
      />
    </div>
  )
}

/**
 * The tree draws in our tokens, so it follows the theme like everything
 * around it (it kept a light row background under dark text in dark before):
 * the ink, the line, R7's chosen and hover fills, the focus colour, and the
 * git states in R1's tones and the diff hues.
 */
const TREE_HOST_STYLE = {
  // The tree's own stylesheet sets `color-scheme: light dark` on its host,
  // which follows the system's setting, not the app's theme: the host takes
  // the app's scheme back, so every token resolves to the theme on screen.
  colorScheme: 'inherit',
  '--trees-fg-override': 'var(--ink)',
  '--trees-fg-muted-override': 'var(--ink-muted)',
  '--trees-bg-override': 'transparent',
  '--trees-bg-muted-override': 'var(--fill-hover)',
  '--trees-input-bg-override': 'var(--canvas)',
  '--trees-search-bg-override': 'var(--canvas)',
  '--trees-search-fg-override': 'var(--ink)',
  '--trees-border-color-override': 'var(--line)',
  '--trees-selected-bg-override': 'var(--fill-selected)',
  '--trees-selected-fg-override': 'var(--on-highlight)',
  '--trees-focus-ring-color-override': 'var(--focus)',
  '--trees-git-added-color-override': 'var(--diff-added)',
  '--trees-git-deleted-color-override': 'var(--diff-removed)',
  '--trees-git-modified-color-override': 'var(--warning-ink)',
  '--trees-git-renamed-color-override': 'var(--info-ink)',
  '--trees-git-untracked-color-override': 'var(--success-ink)',
  '--trees-git-ignored-color-override': 'var(--ink-muted)',
} as CSSProperties
