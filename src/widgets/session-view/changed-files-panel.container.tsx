import { useState, useEffect, useCallback } from 'react'
import type { FC, MouseEvent as ReactMouseEvent } from 'react'
import type { SessionSummary } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  PanelRight,
  RefreshCw,
  X,
} from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { ChangedFileItem } from './changed-file-item.presentational'
import { DiffViewer } from './diff-viewer.presentational'

interface ChangedFile {
  status: string
  file: string
}

interface ChangedFilesPanelProps {
  session: SessionSummary
  side: 'left' | 'right'
  expanded: boolean
  onClose: () => void
  onToggleSide: () => void
  onToggleExpanded: () => void
}

export const ChangedFilesPanel: FC<ChangedFilesPanelProps> = ({
  session,
  side,
  expanded,
  onClose,
  onToggleSide,
  onToggleExpanded,
}) => {
  const [files, setFiles] = useState<ChangedFile[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [diff, setDiff] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [diffLoading, setDiffLoading] = useState(false)

  const loadFiles = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.git.getStatus(
        session.workingDirectory,
      )
      setFiles(result)
      setSelectedFile((current) => {
        if (!result.some((file) => file.file === current)) {
          return result[0]?.file ?? null
        }
        return current
      })
    } catch {
      setFiles([])
      setSelectedFile(null)
    }
    setLoading(false)
  }, [session.workingDirectory])

  useEffect(() => {
    loadFiles()
  }, [loadFiles, session.updatedAt])

  const loadDiff = useCallback(
    async (file: string | null) => {
      if (!file) {
        setDiff('')
        return
      }

      setDiffLoading(true)
      try {
        const result = await window.electronAPI.git.getDiff(
          session.workingDirectory,
          file,
        )
        setDiff(result || '(no diff available)')
      } catch {
        setDiff('Failed to load diff')
      } finally {
        setDiffLoading(false)
      }
    },
    [session.workingDirectory],
  )

  useEffect(() => {
    void loadDiff(selectedFile)
  }, [loadDiff, selectedFile, session.updatedAt])

  const handleFileClick = (file: string) => {
    setSelectedFile((current) => (current === file ? null : file))
  }

  const stopPanelControlEvent = (event: ReactMouseEvent) => {
    event.stopPropagation()
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden bg-card',
        side === 'right' ? 'border-l' : 'border-r',
      )}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onMouseDown={stopPanelControlEvent}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Changed Files ({files.length})
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onToggleSide}
            onMouseDown={stopPanelControlEvent}
            title={side === 'right' ? 'Move panel left' : 'Move panel right'}
          >
            {side === 'right' ? (
              <ArrowLeftToLine className="h-3 w-3" />
            ) : (
              <ArrowRightToLine className="h-3 w-3" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onToggleExpanded}
            onMouseDown={stopPanelControlEvent}
            title={expanded ? 'Use compact width' : 'Use wide width'}
          >
            <PanelRight className={cn('h-3 w-3', expanded && 'scale-x-125')} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={loadFiles}
            onMouseDown={stopPanelControlEvent}
            disabled={loading}
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
            onMouseDown={stopPanelControlEvent}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {files.length === 0 ? (
          <div className="p-3">
            <p className="text-xs text-muted-foreground">
              {loading
                ? 'Loading working tree...'
                : 'No working tree changes detected'}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              This panel shows the current git changes inside the session
              workspace.
            </p>
          </div>
        ) : (
          <div className="shrink-0 border-b border-border px-3 py-2">
            <p className="text-[11px] text-muted-foreground">
              Current git changes in this session workspace.
            </p>
          </div>
        )}

        {files.length > 0 && (
          <div className="shrink-0 border-b border-border">
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Files
              </p>
              <p className="text-[10px] text-muted-foreground">
                {files.length} changed
              </p>
            </div>
            <div
              className={cn(
                'app-scrollbar overflow-y-auto px-1 pb-2',
                expanded ? 'h-56' : 'h-44',
              )}
            >
              {files.map((f) => (
                <ChangedFileItem
                  key={f.file}
                  status={f.status}
                  file={f.file}
                  selected={selectedFile === f.file}
                  onSelect={() => handleFileClick(f.file)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1">
          <DiffViewer file={selectedFile} diff={diff} loading={diffLoading} />
        </div>
      </div>
    </div>
  )
}
