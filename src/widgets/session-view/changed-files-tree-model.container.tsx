import type { CSSProperties, FC, KeyboardEvent } from 'react'
import { useMemo } from 'react'
import type { FileTreeRowDecorationRenderer } from '@pierre/trees'
import { FileTree, useFileTree, useFileTreeSearch } from '@pierre/trees/react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
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

  const { model } = useFileTree({
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
  const search = useFileTreeSearch(model)

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
                aria-label="Search changed files"
                className="h-7 min-w-0 flex-1 rounded px-2 font-mono text-xs"
                placeholder="Search files"
                value={search.value}
                onChange={(event) => search.setValue(event.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              {search.value && (
                <span className="w-10 text-right text-[10px] tabular-nums text-muted-foreground">
                  {search.matchingPaths.length}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Previous match"
                aria-label="Previous search match"
                disabled={!search.value || search.matchingPaths.length === 0}
                onClick={search.focusPreviousMatch}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Next match"
                aria-label="Next search match"
                disabled={!search.value || search.matchingPaths.length === 0}
                onClick={search.focusNextMatch}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Close search"
                aria-label="Close changed-files search"
                onClick={() => {
                  search.setValue(null)
                  search.close()
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto h-7 w-7"
              title="Search changed files"
              aria-label="Search changed files"
              onClick={() => search.open(search.value)}
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
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

const TREE_HOST_STYLE = {
  '--trees-fg-override': 'var(--foreground)',
  '--trees-border-color-override': 'var(--border)',
  '--trees-selected-bg-override':
    'color-mix(in srgb, var(--accent) 55%, transparent)',
} as CSSProperties
