import type { FC } from 'react'
import { ChangedFilesTree } from '@/widgets/session-view'
import type { CodeReviewFileEntry } from '@/entities/code-review'
import { StatusFilterButton } from './status-filter-button.presentational'

interface CodeReviewFileRailProps {
  files: CodeReviewFileEntry[]
  visibleFiles: CodeReviewFileEntry[]
  selectedFile: string | null
  loading: boolean
  noteCountsByPath?: ReadonlyMap<string, number> | Record<string, number>
  statusFilter: string
  statusCounts: Record<string, number>
  onStatusFilterChange: (status: string) => void
  onSelectFile: (file: string) => void
}

export const CodeReviewFileRail: FC<CodeReviewFileRailProps> = ({
  files,
  visibleFiles,
  selectedFile,
  loading,
  noteCountsByPath,
  statusFilter,
  statusCounts,
  onStatusFilterChange,
  onSelectFile,
}) => {
  const statuses = Object.keys(statusCounts).sort()

  return (
    <aside className="flex min-h-0 flex-col border-r border-border">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          Changed Files
        </span>
        <span className="text-xs text-muted-foreground">{files.length}</span>
      </div>

      <div className="flex shrink-0 flex-wrap gap-1 border-b border-border px-2 py-2">
        <StatusFilterButton
          active={statusFilter === 'all'}
          label="All"
          count={files.length}
          onClick={() => onStatusFilterChange('all')}
        />
        {statuses.map((status) => (
          <StatusFilterButton
            key={status}
            active={statusFilter === status}
            label={status}
            count={statusCounts[status] ?? 0}
            onClick={() => onStatusFilterChange(status)}
          />
        ))}
      </div>

      <ChangedFilesTree
        files={visibleFiles}
        selectedFile={selectedFile}
        loading={loading}
        emptyMessage={
          statusFilter === 'all'
            ? 'No changed files detected'
            : `No ${statusFilter} files detected`
        }
        className="p-2"
        noteCountsByPath={noteCountsByPath}
        onSelectFile={onSelectFile}
      />
    </aside>
  )
}
