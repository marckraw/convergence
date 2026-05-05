import { useState, useEffect, useCallback, useMemo } from 'react'
import type { FC, MouseEvent as ReactMouseEvent } from 'react'
import type { SessionSummary } from '@/entities/session'
import type { ResolvedBaseBranch } from '@/entities/workspace'
import { gitApi } from '@/entities/workspace'
import { Button } from '@/shared/ui/button'
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  MessageSquarePlus,
  PanelRight,
  RefreshCw,
  X,
} from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { ChangedFileItem } from './changed-file-item.presentational'
import { ChangedFilesModeButton } from './changed-files-mode-button.presentational'
import {
  getChangedFilesEmptyMessage,
  getChangedFilesHeaderLabel,
  selectChangedFileAfterReload,
  type ChangedFilesReviewMode,
} from './changed-files.pure'
import { DiffViewer } from './diff-viewer.presentational'
import {
  parseUnifiedDiff,
  selectDiffLineRange,
  summarizeSelectedDiffLines,
  type DiffLine,
} from './diff-lines.pure'
import { TurnList } from './turn-list.container'

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
  const [mode, setMode] = useState<ChangedFilesReviewMode>(
    expanded ? 'turns' : 'working-tree',
  )
  const [base, setBase] = useState<ResolvedBaseBranch | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [diffLoading, setDiffLoading] = useState(false)
  const [selectedDiffLineIds, setSelectedDiffLineIds] = useState<string[]>([])
  const [selectionAnchorLineId, setSelectionAnchorLineId] = useState<
    string | null
  >(null)
  const diffLines = useMemo(() => parseUnifiedDiff(diff), [diff])
  const selectedDiffSummary = useMemo(
    () =>
      summarizeSelectedDiffLines({
        lines: diffLines,
        selectedIds: selectedDiffLineIds,
      }),
    [diffLines, selectedDiffLineIds],
  )

  useEffect(() => {
    setMode((current) => {
      if (!expanded && current === 'turns') return 'working-tree'
      if (expanded && current === 'working-tree') return 'turns'
      return current
    })
  }, [expanded])

  const loadFiles = useCallback(async () => {
    if (mode === 'turns') return

    setLoading(true)
    setError(null)
    try {
      const result =
        mode === 'base-branch'
          ? await gitApi.getBaseBranchStatus(session.id)
          : await gitApi.getStatus(session.workingDirectory)
      const nextFiles = Array.isArray(result) ? result : result.files
      setBase(Array.isArray(result) ? null : result.base)
      setFiles(nextFiles)
      setSelectedFile((current) =>
        selectChangedFileAfterReload({ current, files: nextFiles }),
      )
    } catch (err) {
      setFiles([])
      setBase(null)
      setSelectedFile(null)
      setError(err instanceof Error ? err.message : 'Failed to load changes')
    } finally {
      setLoading(false)
    }
  }, [mode, session.id, session.workingDirectory])

  useEffect(() => {
    void loadFiles()
  }, [loadFiles, session.updatedAt])

  const loadDiff = useCallback(
    async (file: string | null) => {
      if (mode === 'turns') {
        setDiff('')
        return
      }

      if (!file) {
        setDiff('')
        return
      }

      setDiffLoading(true)
      try {
        const result =
          mode === 'base-branch'
            ? await gitApi.getBaseBranchDiff(session.id, file)
            : await gitApi.getDiff(session.workingDirectory, file)
        setDiff(result || '(no diff available)')
      } catch {
        setDiff('Failed to load diff')
      } finally {
        setDiffLoading(false)
      }
    },
    [mode, session.id, session.workingDirectory],
  )

  useEffect(() => {
    void loadDiff(selectedFile)
  }, [loadDiff, selectedFile, session.updatedAt])

  useEffect(() => {
    setSelectedDiffLineIds([])
    setSelectionAnchorLineId(null)
  }, [session.id, mode, selectedFile, diff])

  const handleFileClick = (file: string) => {
    setSelectedFile((current) => (current === file ? null : file))
  }

  const handleModeChange = (nextMode: ChangedFilesReviewMode) => {
    if (nextMode === mode) return
    setMode(nextMode)
    setFiles([])
    setSelectedFile(null)
    setDiff('')
    setBase(null)
    setError(null)
    setSelectedDiffLineIds([])
    setSelectionAnchorLineId(null)
  }

  const handleDiffLineClick = (
    line: DiffLine,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    if (event.shiftKey) {
      setSelectedDiffLineIds(
        selectDiffLineRange({
          lines: diffLines,
          anchorId: selectionAnchorLineId,
          targetId: line.id,
        }),
      )
      setSelectionAnchorLineId((current) => current ?? line.id)
      return
    }

    setSelectedDiffLineIds([line.id])
    setSelectionAnchorLineId(line.id)
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
          {getChangedFilesHeaderLabel({ mode, count: files.length, base })}
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
          {mode !== 'turns' && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={loadFiles}
              onMouseDown={stopPanelControlEvent}
              disabled={loading}
              title="Refresh changed files"
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            </Button>
          )}
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

      <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2">
        <ChangedFilesModeButton
          active={mode === 'working-tree'}
          label="Working Tree"
          onClick={() => handleModeChange('working-tree')}
        />
        <ChangedFilesModeButton
          active={mode === 'base-branch'}
          label="Base Branch"
          onClick={() => handleModeChange('base-branch')}
        />
        {expanded && (
          <ChangedFilesModeButton
            active={mode === 'turns'}
            label="Turns"
            onClick={() => handleModeChange('turns')}
          />
        )}
      </div>

      {mode === 'turns' ? (
        <TurnList sessionId={session.id} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {files.length === 0 ? (
            <div className="p-3">
              <p className="text-xs text-muted-foreground">
                {getChangedFilesEmptyMessage({
                  mode,
                  loading,
                  base,
                  error,
                })}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                {mode === 'base-branch'
                  ? 'This panel shows committed and local changes compared with the resolved base branch.'
                  : 'This panel shows the current git changes inside the session workspace.'}
              </p>
            </div>
          ) : (
            <div className="shrink-0 border-b border-border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">
                {mode === 'base-branch'
                  ? `Changes compared with ${base?.branchName ?? 'the base branch'}. Includes local uncommitted edits.`
                  : 'Current git changes in this session workspace.'}
              </p>
              {base?.warning && (
                <p className="mt-1 text-[11px] text-amber-400/90">
                  {base.warning}
                </p>
              )}
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
            {selectedDiffSummary.count > 0 && (
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">
                    {selectedDiffSummary.count}{' '}
                    {selectedDiffSummary.count === 1 ? 'line' : 'lines'}{' '}
                    selected
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {formatSelectionSummary(selectedDiffSummary)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1.5 px-2 text-xs"
                  disabled
                  title="Review note persistence is planned in MAR-1138"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  Add note
                </Button>
              </div>
            )}
            <DiffViewer
              file={selectedFile}
              diff={diff}
              lines={diffLines}
              selectedLineIds={selectedDiffLineIds}
              onLineClick={handleDiffLineClick}
              loading={diffLoading}
              title={
                mode === 'base-branch'
                  ? `Diff against ${base?.branchName ?? 'base branch'}`
                  : 'Current workspace diff'
              }
              emptyMessage={
                mode === 'base-branch'
                  ? 'Select a changed file to inspect its base branch diff.'
                  : 'Select a changed file to inspect its working tree diff.'
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}

function formatSelectionSummary(summary: {
  oldStartLine: number | null
  oldEndLine: number | null
  newStartLine: number | null
  newEndLine: number | null
}): string {
  const oldRange = formatLineRange(summary.oldStartLine, summary.oldEndLine)
  const newRange = formatLineRange(summary.newStartLine, summary.newEndLine)
  if (oldRange && newRange) return `Old ${oldRange} · New ${newRange}`
  if (oldRange) return `Old ${oldRange}`
  if (newRange) return `New ${newRange}`
  return 'Metadata lines'
}

function formatLineRange(start: number | null, end: number | null): string {
  if (start === null) return ''
  if (end === null || end === start) return String(start)
  return `${start}-${end}`
}
