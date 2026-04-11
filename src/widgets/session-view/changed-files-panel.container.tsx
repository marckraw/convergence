import { useState, useEffect, useCallback } from 'react'
import type { FC } from 'react'
import type { Session } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { ChevronRight, RefreshCw, X } from 'lucide-react'
import { FileStatusIcon } from '@/shared/ui/file-status-icon.presentational'
import { cn } from '@/shared/lib/cn.pure'

interface ChangedFile {
  status: string
  file: string
}

interface ChangedFilesPanelProps {
  session: Session
  onClose: () => void
}

export const ChangedFilesPanel: FC<ChangedFilesPanelProps> = ({
  session,
  onClose,
}) => {
  const [files, setFiles] = useState<ChangedFile[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [diff, setDiff] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const loadFiles = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.git.getStatus(
        session.workingDirectory,
      )
      setFiles(result)
    } catch {
      setFiles([])
    }
    setLoading(false)
  }, [session.workingDirectory])

  useEffect(() => {
    loadFiles()
  }, [loadFiles, session.transcript.length])

  const handleFileClick = async (file: string) => {
    if (selectedFile === file) {
      setSelectedFile(null)
      setDiff('')
      return
    }
    setSelectedFile(file)
    try {
      const result = await window.electronAPI.git.getDiff(
        session.workingDirectory,
        file,
      )
      setDiff(result || '(no diff — file may be untracked)')
    } catch {
      setDiff('Failed to load diff')
    }
  }

  return (
    <div className="flex h-full flex-col border-l bg-card">
      <div className="flex h-12 items-center justify-between border-b px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Changed Files ({files.length})
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={loadFiles}
            disabled={loading}
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            {loading ? 'Loading...' : 'No changes detected'}
          </p>
        ) : (
          <div className="p-1">
            {files.map((f) => (
              <button
                key={f.file}
                onClick={() => handleFileClick(f.file)}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                  selectedFile === f.file && 'bg-accent',
                )}
              >
                <ChevronRight
                  className={cn(
                    'h-3 w-3 shrink-0 transition-transform',
                    selectedFile === f.file && 'rotate-90',
                  )}
                />
                <FileStatusIcon status={f.status} />
                <span className="truncate font-mono">{f.file}</span>
              </button>
            ))}
          </div>
        )}

        {selectedFile && diff && (
          <div className="border-t p-2">
            <pre className="max-h-64 overflow-auto rounded bg-background p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {diff.split('\n').map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    line.startsWith('+') &&
                      !line.startsWith('+++') &&
                      'text-green-500',
                    line.startsWith('-') &&
                      !line.startsWith('---') &&
                      'text-red-500',
                    line.startsWith('@@') && 'text-blue-500',
                  )}
                >
                  {line}
                </div>
              ))}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
