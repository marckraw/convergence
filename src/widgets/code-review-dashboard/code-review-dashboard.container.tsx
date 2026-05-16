import { useEffect, useMemo } from 'react'
import type { FC } from 'react'
import {
  getCodeReviewTargetSourceLabel,
  getCodeReviewTargetSubtitle,
  getCodeReviewTargetTitle,
  useCodeReviewStore,
  type CodeReviewTarget,
} from '@/entities/code-review'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'
import {
  FileCode2,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react'
import { TargetFact } from './target-fact.presentational'

const sourceIcon = {
  session: FileCode2,
  workspace: GitBranch,
  'project-repository': FolderGit2,
  'pull-request': GitPullRequest,
} satisfies Record<CodeReviewTarget['source'], typeof FileCode2>

export const CodeReviewDashboard: FC = () => {
  const activeProject = useProjectStore((state) => state.activeProject)
  const activeSessionId = useSessionStore((state) => state.activeSessionId)
  const targets = useCodeReviewStore((state) => state.targets)
  const selectedTarget = useCodeReviewStore((state) => state.selectedTarget)
  const selectedMode = useCodeReviewStore((state) => state.selectedMode)
  const selectedFile = useCodeReviewStore((state) => state.selectedFile)
  const targetsLoading = useCodeReviewStore((state) => state.targetsLoading)
  const error = useCodeReviewStore((state) => state.error)
  const loadTargets = useCodeReviewStore((state) => state.loadTargets)
  const setSelectedTarget = useCodeReviewStore(
    (state) => state.setSelectedTarget,
  )
  const closeReview = useCodeReviewStore((state) => state.closeReview)

  useEffect(() => {
    if (!activeProject) return
    void loadTargets({
      projectId: activeProject.id,
      sessionId: activeSessionId,
    })
  }, [activeProject, activeSessionId, loadTargets])

  const visibleTargets = useMemo(
    () =>
      [...targets].sort((a, b) => {
        const changedDelta =
          b.status.workingTreeFileCount - a.status.workingTreeFileCount
        if (changedDelta !== 0) return changedDelta
        return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
      }),
    [targets],
  )

  if (!activeProject) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No active project
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div
        className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex min-w-0 items-center gap-2">
          <FileCode2 className="h-4 w-4 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Code Review</p>
            <p className="truncate text-xs text-muted-foreground">
              {activeProject.name}
            </p>
          </div>
        </div>
        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Refresh review targets"
            disabled={targetsLoading}
            onClick={() =>
              void loadTargets({
                projectId: activeProject.id,
                sessionId: activeSessionId,
              })
            }
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', targetsLoading && 'animate-spin')}
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Close code review"
            onClick={closeReview}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,360px)_1fr] overflow-hidden">
        <aside className="flex min-h-0 flex-col border-r border-border">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              Review Targets
            </span>
            {targetsLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-xs text-muted-foreground">
                {visibleTargets.length}
              </span>
            )}
          </div>

          <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
            {error ? (
              <p className="px-2 py-3 text-sm text-destructive">{error}</p>
            ) : null}
            {visibleTargets.map((target) => {
              const Icon = sourceIcon[target.source]
              const selected = selectedTarget?.id === target.id
              return (
                <Button
                  key={target.id}
                  type="button"
                  variant="ghost"
                  className={cn(
                    'mb-1 flex h-auto min-h-[72px] w-full min-w-0 items-start justify-start gap-2 whitespace-normal rounded-md border px-2.5 py-2.5 text-left transition-colors',
                    selected
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-transparent hover:border-border hover:bg-accent',
                  )}
                  onClick={() => setSelectedTarget(target)}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm leading-5 font-medium">
                      {getCodeReviewTargetTitle(target)}
                    </span>
                    <span className="block truncate text-xs leading-4 text-muted-foreground">
                      {getCodeReviewTargetSubtitle(target)}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-[11px] leading-4 text-muted-foreground">
                      <span>{target.status.workingTreeFileCount} changed</span>
                      {target.status.error ? (
                        <span className="truncate text-destructive">
                          {target.status.error}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Button>
              )
            })}
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden">
          {selectedTarget ? (
            <div className="flex h-full flex-col">
              <div className="border-b border-border p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  {getCodeReviewTargetSourceLabel(selectedTarget.source)}
                </p>
                <h1 className="mt-1 truncate text-lg font-semibold">
                  {getCodeReviewTargetTitle(selectedTarget)}
                </h1>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {selectedTarget.repositoryPath}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 p-4">
                <TargetFact label="Mode" value={selectedMode} />
                <TargetFact
                  label="Changed files"
                  value={String(selectedTarget.status.workingTreeFileCount)}
                />
                <TargetFact
                  label="Selected file"
                  value={selectedFile ?? 'None'}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {targetsLoading
                ? 'Loading review targets...'
                : 'No review targets'}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
