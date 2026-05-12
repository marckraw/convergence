import type { FC } from 'react'
import { ExternalLink, GitBranch, GitPullRequest, Star } from 'lucide-react'
import type { Space, SpaceAttempt, SpaceArtifact } from '@/entities/space'
import { spaceAttemptRoleLabels, spaceStatusLabels } from '@/entities/space'
import { Button } from '@/shared/ui/button'

export interface SpaceContextAttemptView {
  attempt: SpaceAttempt
  sessionName: string
  projectName: string
  branchName: string | null
  providerId: string
}

interface SpaceContextPanelProps {
  space: Space
  attempts: SpaceContextAttemptView[]
  artifacts: SpaceArtifact[]
  onOpenSpace: (spaceId: string) => void
}

export const SpaceContextPanel: FC<SpaceContextPanelProps> = ({
  space,
  attempts,
  artifacts,
  onOpenSpace,
}) => {
  return (
    <aside
      className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-background/70"
      data-testid="space-context-panel"
    >
      <div className="border-b border-border/70 px-4 py-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{space.title}</div>
            <div className="mt-2">
              <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-700 dark:text-cyan-200">
                {spaceStatusLabels[space.status]}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onOpenSpace(space.id)}
            aria-label={`Open Space ${space.title}`}
            title="Open Space"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <section className="space-y-2">
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Space brief
          </div>
          <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-3 text-sm leading-6">
            {space.brief.trim() ? (
              <p className="whitespace-pre-wrap">{space.brief}</p>
            ) : (
              <p className="text-muted-foreground">No Space brief yet.</p>
            )}
          </div>
        </section>

        <section className="mt-5 space-y-2">
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Attempts
          </div>
          <div className="space-y-2">
            {attempts.map((view) => (
              <div
                key={view.attempt.id}
                className="rounded-lg border border-border/60 bg-card/30 px-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {view.sessionName}
                  </span>
                  {view.attempt.isPrimary ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning-foreground">
                      <Star className="h-3 w-3" />
                      Primary
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{spaceAttemptRoleLabels[view.attempt.role]}</span>
                  <span>{view.projectName}</span>
                  {view.branchName ? (
                    <span className="inline-flex items-center gap-1">
                      <GitBranch className="h-3.5 w-3.5" />
                      {view.branchName}
                    </span>
                  ) : null}
                  <span>{view.providerId}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 space-y-2">
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Artifacts
          </div>
          {artifacts.length === 0 ? (
            <div className="rounded-lg border border-border/60 px-3 py-3 text-sm text-muted-foreground">
              No artifacts yet.
            </div>
          ) : (
            <div className="space-y-2">
              {artifacts.map((artifact) => (
                <div
                  key={artifact.id}
                  className="rounded-lg border border-border/60 bg-card/30 px-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <GitPullRequest className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">
                      {artifact.label}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {artifact.kind} · {artifact.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  )
}
