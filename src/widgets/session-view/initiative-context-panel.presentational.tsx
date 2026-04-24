import type { FC } from 'react'
import { ExternalLink, GitBranch, GitPullRequest, Star } from 'lucide-react'
import type {
  Initiative,
  InitiativeAttempt,
  InitiativeOutput,
} from '@/entities/initiative'
import {
  initiativeAttemptRoleLabels,
  initiativeStatusLabels,
} from '@/entities/initiative'
import { Button } from '@/shared/ui/button'

export interface InitiativeContextAttemptView {
  attempt: InitiativeAttempt
  sessionName: string
  projectName: string
  branchName: string | null
  providerId: string
}

interface InitiativeContextPanelProps {
  initiative: Initiative
  attempts: InitiativeContextAttemptView[]
  outputs: InitiativeOutput[]
  onOpenInitiative: (initiativeId: string) => void
}

export const InitiativeContextPanel: FC<InitiativeContextPanelProps> = ({
  initiative,
  attempts,
  outputs,
  onOpenInitiative,
}) => {
  return (
    <aside
      className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-background/70"
      data-testid="initiative-context-panel"
    >
      <div className="border-b border-border/70 px-4 py-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {initiative.title}
            </div>
            <div className="mt-2">
              <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-200">
                {initiativeStatusLabels[initiative.status]}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onOpenInitiative(initiative.id)}
            aria-label={`Open Initiative ${initiative.title}`}
            title="Open Initiative"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <section className="space-y-2">
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Current understanding
          </div>
          <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-3 text-sm leading-6">
            {initiative.currentUnderstanding.trim() ? (
              <p className="whitespace-pre-wrap">
                {initiative.currentUnderstanding}
              </p>
            ) : (
              <p className="text-muted-foreground">
                No current understanding yet.
              </p>
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
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                      <Star className="h-3 w-3" />
                      Primary
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{initiativeAttemptRoleLabels[view.attempt.role]}</span>
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
            Outputs
          </div>
          {outputs.length === 0 ? (
            <div className="rounded-lg border border-border/60 px-3 py-3 text-sm text-muted-foreground">
              No outputs yet.
            </div>
          ) : (
            <div className="space-y-2">
              {outputs.map((output) => (
                <div
                  key={output.id}
                  className="rounded-lg border border-border/60 bg-card/30 px-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <GitPullRequest className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">
                      {output.label}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {output.kind} · {output.status}
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
