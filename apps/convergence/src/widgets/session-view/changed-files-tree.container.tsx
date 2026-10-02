import type { FC } from 'react'
import { useMemo } from 'react'
import { cn, EmptyState } from '@convergence/ui'
import {
  buildPierreChangedFilesTreeInput,
  type PierreChangedFileInput,
  type PierreChangedFilesTreeInput,
} from './changed-files-tree.pure'
import { ChangedFilesTreeModel } from './changed-files-tree-model.container'

interface ChangedFilesTreeProps {
  files: PierreChangedFileInput[]
  selectedFile: string | null
  loading?: boolean
  emptyMessage?: string
  noteCountsByPath?: ReadonlyMap<string, number> | Record<string, number>
  className?: string
  search?: boolean
  onSelectFile?: (file: string) => void
}

export const ChangedFilesTree: FC<ChangedFilesTreeProps> = ({
  files,
  selectedFile,
  loading = false,
  emptyMessage = 'No changed files detected',
  noteCountsByPath,
  className,
  search = true,
  onSelectFile,
}) => {
  const treeInput = useMemo(
    () => buildPierreChangedFilesTreeInput({ files, noteCountsByPath }),
    [files, noteCountsByPath],
  )
  const treeKey = buildTreeModelKey(treeInput)

  // Loading and empty read as every list's do (CONV-19).
  if (loading) {
    return (
      <EmptyState
        state="loading"
        size="compact"
        variant="plain"
        title="Loading changed files…"
      />
    )
  }

  if (treeInput.paths.length === 0) {
    return <EmptyState size="compact" variant="plain" title={emptyMessage} />
  }

  return (
    <div className={cn('min-h-0 flex-1 overflow-hidden', className)}>
      <ChangedFilesTreeModel
        key={treeKey}
        treeInput={treeInput}
        selectedFile={selectedFile}
        search={search}
        onSelectFile={onSelectFile}
      />
    </div>
  )
}

function buildTreeModelKey(treeInput: PierreChangedFilesTreeInput): string {
  return JSON.stringify({
    paths: treeInput.paths,
    gitStatus: treeInput.gitStatus,
    noteCounts: [...treeInput.noteCountsByPath.entries()],
  })
}
