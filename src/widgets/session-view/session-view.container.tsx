import { useEffect, useRef, useState, useCallback } from 'react'
import type { FC } from 'react'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { ComposerContainer } from '@/features/composer'
import { Button } from '@/shared/ui/button'
import { Square, FileCode, GitBranch } from 'lucide-react'
import { AttentionIndicator } from '@/shared/ui/attention-indicator.presentational'
import { TranscriptEntryView } from './transcript-entry.presentational'
import { ChangedFilesPanel } from './changed-files-panel.container'

export const SessionView: FC = () => {
  const activeProject = useProjectStore((s) => s.activeProject)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sessions = useSessionStore((s) => s.sessions)
  const approveSession = useSessionStore((s) => s.approveSession)
  const denySession = useSessionStore((s) => s.denySession)
  const stopSession = useSessionStore((s) => s.stopSession)
  const [showChangedFiles, setShowChangedFiles] = useState(false)
  const [branchName, setBranchName] = useState<string | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  const session = sessions.find((s) => s.id === activeSessionId) ?? null

  const scrollToBottom = useCallback(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [session?.transcript.length, scrollToBottom])

  // Load branch name for the session's working directory
  useEffect(() => {
    if (session?.workingDirectory) {
      window.electronAPI.git
        .getCurrentBranch(session.workingDirectory)
        .then(setBranchName)
        .catch(() => setBranchName(null))
    }
  }, [session?.workingDirectory])

  // Empty state
  if (!session) {
    return (
      <div className="flex h-full flex-col">
        <div
          className="h-12 shrink-0 border-b border-border"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <p className="mb-1 text-lg font-medium">Convergence</p>
          <p className="mb-8 text-sm text-muted-foreground">
            What would you like to work on?
          </p>
          {activeProject && (
            <ComposerContainer
              projectId={activeProject.id}
              workspaceId={null}
              activeSessionId={null}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Main session area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div
          className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div
            className="flex items-center gap-2"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <span className="font-medium">{session.name}</span>
            <AttentionIndicator attention={session.attention} />
            {branchName && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                {branchName}
              </span>
            )}
          </div>
          <div
            className="flex items-center gap-1"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowChangedFiles(!showChangedFiles)}
              title="Changed files"
            >
              <FileCode className="h-3.5 w-3.5" />
            </Button>
            {session.status === 'running' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => stopSession(session.id)}
              >
                <Square className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto px-4">
          <div className="mx-auto max-w-2xl py-4">
            {session.transcript.map((entry, i) => {
              const isLastApproval =
                entry.type === 'approval-request' &&
                session.attention === 'needs-approval' &&
                i === session.transcript.length - 1

              return (
                <TranscriptEntryView
                  key={i}
                  entry={entry}
                  onApprove={
                    isLastApproval
                      ? () => approveSession(session.id)
                      : undefined
                  }
                  onDeny={
                    isLastApproval ? () => denySession(session.id) : undefined
                  }
                />
              )
            })}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="shrink-0 px-4 py-3">
          {activeProject && (
            <ComposerContainer
              projectId={activeProject.id}
              workspaceId={session.workspaceId}
              activeSessionId={session.id}
            />
          )}
        </div>
      </div>

      {/* Changed files side panel */}
      {showChangedFiles && (
        <div className="w-72 shrink-0">
          <ChangedFilesPanel
            session={session}
            onClose={() => setShowChangedFiles(false)}
          />
        </div>
      )}
    </div>
  )
}
