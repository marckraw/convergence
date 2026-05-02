import type { CSSProperties, FC } from 'react'
import {
  Bot,
  CircleDot,
  Clock3,
  ExternalLink,
  FileCode,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Layers3,
  ListChecks,
  MapPinned,
  Play,
  RefreshCw,
  Route,
  SearchCheck,
  Settings2,
  Square,
  TerminalSquare,
  Workflow,
} from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { CopyButton } from '@/shared/ui/copy-button'
import type { WorkboardSnapshot } from '@/entities/workboard'
import {
  issueStateClassNames,
  runStatusClassNames,
  runStatusLabels,
} from './ralph-task-dashboard.styles'
import { ActiveRunCard } from './active-run-card.presentational'
import { IssueCandidateCard } from './issue-candidate-card.presentational'
import { Pill } from './pill.presentational'
import { ProjectComposerCard } from './project-composer-card.presentational'
import { StageRow } from './stage-row.presentational'
import { TrackerSourceCard } from './tracker-source-card.presentational'

interface RalphTaskDashboardViewProps {
  snapshot: WorkboardSnapshot
  operation: 'loading' | 'syncing' | 'starting-run' | 'stopping-run' | null
  error: string | null
  statusMessage: string | null
  onSelectRun: (id: string) => void
  onSyncSources: () => void
  onStartRun: (projectId: string, issueIds: string[]) => void
  onStopRun: (runId: string) => void
  onOpenSettings: () => void
}

export const RalphTaskDashboardView: FC<RalphTaskDashboardViewProps> = ({
  snapshot,
  operation,
  error,
  statusMessage,
  onSelectRun,
  onSyncSources,
  onStartRun,
  onStopRun,
  onOpenSettings,
}) => {
  const selectedRun =
    snapshot.activeRuns.find((run) => run.id === snapshot.selectedRunId) ??
    snapshot.activeRuns[0] ??
    null
  const readyIssueCount = snapshot.candidates.filter(
    (issue) => issue.state === 'ready',
  ).length
  const mappedIssueCount = snapshot.candidates.filter(
    (issue) => issue.mappingStatus === 'mapped',
  ).length
  const runningStageCount = snapshot.activeRuns.flatMap((run) =>
    run.stages.filter((stage) => stage.status === 'running'),
  ).length
  const blockedCount =
    snapshot.candidates.filter((issue) => issue.state === 'blocked').length +
    snapshot.activeRuns.filter((run) => run.status === 'blocked').length
  const selectedIssues = selectedRun
    ? snapshot.candidates.filter((issue) =>
        selectedRun.issueIds.includes(issue.id),
      )
    : []
  const firstReadyGroup = snapshot.projectGroups.find(
    (group) =>
      group.sandcastleStatus === 'ready' && group.selectedIssueIds.length === 1,
  )
  const isSyncing = operation === 'syncing'
  const isStartingRun = operation === 'starting-run'
  const isBusy = operation !== null
  const selectedRunCommitArgs = selectedRun?.commits.join(' ') ?? ''
  const selectedRunCheckoutCommand = selectedRun
    ? `git checkout ${selectedRun.branchName}`
    : ''
  const selectedRunDiffCommand =
    selectedRun && selectedRunCommitArgs
      ? `git show --stat --patch ${selectedRunCommitArgs}`
      : ''
  const selectedRunPushCommand = selectedRun
    ? `git push -u origin ${selectedRun.branchName}`
    : ''

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        className="flex h-12 shrink-0 items-center justify-between border-b border-border/70 px-5"
        style={{ WebkitAppRegion: 'drag' } as CSSProperties}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background">
            <Workflow className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">Agent Workboard</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              Loop-ready Linear and Jira issues mapped to project Sandcastle
              runs
            </p>
          </div>
        </div>

        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenSettings}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Settings
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSyncSources}
            disabled={isBusy}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`}
            />
            {isSyncing ? 'Syncing...' : 'Sync trackers'}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!firstReadyGroup || isBusy}
            onClick={() => {
              if (!firstReadyGroup) return
              onStartRun(
                firstReadyGroup.projectId,
                firstReadyGroup.selectedIssueIds,
              )
            }}
          >
            <Play className="h-3.5 w-3.5" />
            {isStartingRun ? 'Starting...' : 'Start selected'}
          </Button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)_360px] overflow-hidden">
        <aside className="app-scrollbar min-h-0 overflow-y-auto border-r border-border/70 px-4 py-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border border-border bg-background/58 px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">Ready</p>
              <p className="mt-1 text-lg font-semibold">{readyIssueCount}</p>
            </div>
            <div className="rounded border border-border bg-background/58 px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">Mapped</p>
              <p className="mt-1 text-lg font-semibold">{mappedIssueCount}</p>
            </div>
            <div className="rounded border border-border bg-background/58 px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">Running</p>
              <p className="mt-1 text-lg font-semibold">{runningStageCount}</p>
            </div>
            <div className="rounded border border-border bg-background/58 px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">Blocked</p>
              <p className="mt-1 text-lg font-semibold">{blockedCount}</p>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tracker sources
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onOpenSettings}
                disabled={isBusy}
                aria-label="Open Workboard settings"
              >
                <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
            <div className="space-y-2">
              {snapshot.trackerSources.map((source) => (
                <TrackerSourceCard key={source.id} source={source} />
              ))}
              {snapshot.trackerSources.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-card/52 p-3 text-xs leading-relaxed text-muted-foreground">
                  No Linear or Jira sources configured yet.
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Loop candidates
              </h2>
              <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              {snapshot.candidates.map((issue) => (
                <IssueCandidateCard key={issue.id} issue={issue} />
              ))}
              {snapshot.candidates.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-card/52 p-3 text-xs leading-relaxed text-muted-foreground">
                  No loop-ready issues synced yet.
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <section className="app-scrollbar min-h-0 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
              {error}
            </div>
          ) : statusMessage ? (
            <div className="mb-3 rounded-md border border-border bg-card/64 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {statusMessage}
            </div>
          ) : null}

          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Run composer</h2>
              <p className="text-xs text-muted-foreground">
                Group loop-ready issues by mapped project before starting
                Sandcastle.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <MapPinned className="h-3.5 w-3.5" />
                {snapshot.projectGroups.length} mapped projects
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CircleDot className="h-3.5 w-3.5 text-emerald-500" />
                Live run state
              </span>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {snapshot.projectGroups.map((group) => (
              <ProjectComposerCard
                key={group.id}
                group={group}
                issues={snapshot.candidates.filter((issue) =>
                  group.candidateIds.includes(issue.id),
                )}
                disabled={isBusy}
                onStart={onStartRun}
              />
            ))}
            {snapshot.projectGroups.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-card/52 p-4 text-sm text-muted-foreground">
                No mapped project groups yet. Add a tracker source, sync issues,
                and create a project mapping to compose Sandcastle runs.
              </div>
            ) : null}
          </div>

          <div className="mt-6 mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Active Sandcastle runs</h2>
              <p className="text-xs text-muted-foreground">
                Per-project orchestration runs launched by Convergence.
              </p>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {snapshot.activeRuns.map((run) => (
              <ActiveRunCard
                key={run.id}
                run={run}
                selected={run.id === selectedRun?.id}
                onSelect={() => onSelectRun(run.id)}
              />
            ))}
            {snapshot.activeRuns.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-card/52 p-4 text-sm text-muted-foreground">
                No Sandcastle runs yet. Synced loop-ready issues will become
                runnable after project mapping and readiness checks.
              </div>
            ) : null}
          </div>
        </section>

        <aside className="app-scrollbar min-h-0 overflow-y-auto border-l border-border/70 bg-background/32 px-4 py-4">
          {selectedRun ? (
            <>
              <div className="mb-3">
                <div className="mb-2 flex items-center gap-2">
                  <Pill className={runStatusClassNames[selectedRun.status]}>
                    {runStatusLabels[selectedRun.status]}
                  </Pill>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {selectedRun.projectName}
                  </span>
                </div>
                <h2 className="text-base font-semibold leading-snug">
                  {selectedRun.workflow} · {selectedRun.issueIds.length} issue
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {selectedRun.summary}
                </p>
              </div>

              <div
                className={`mb-4 rounded-md border px-3 py-2 ${
                  selectedRun.status === 'failed'
                    ? 'border-destructive/40 bg-destructive/10'
                    : 'border-border bg-card/68'
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <TerminalSquare
                    className={`h-3.5 w-3.5 ${
                      selectedRun.status === 'failed'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    }`}
                  />
                  <h3 className="text-xs font-semibold">Run message</h3>
                </div>
                <p
                  className={`whitespace-pre-wrap break-words text-xs leading-relaxed ${
                    selectedRun.status === 'failed'
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                  }`}
                >
                  {selectedRun.summary}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-border bg-card/68 px-2.5 py-2">
                  <p className="text-[11px] text-muted-foreground">Project</p>
                  <p className="mt-1 truncate font-medium">
                    {selectedRun.projectName}
                  </p>
                </div>
                <div className="rounded border border-border bg-card/68 px-2.5 py-2">
                  <p className="text-[11px] text-muted-foreground">Sandbox</p>
                  <p className="mt-1 truncate font-medium">
                    {selectedRun.sandbox}
                  </p>
                </div>
                <div className="rounded border border-border bg-card/68 px-2.5 py-2">
                  <p className="text-[11px] text-muted-foreground">
                    Branch mode
                  </p>
                  <p className="mt-1 truncate font-medium">
                    {selectedRun.branchStrategy}
                  </p>
                </div>
                <div className="rounded border border-border bg-card/68 px-2.5 py-2">
                  <p className="text-[11px] text-muted-foreground">Policy</p>
                  <p className="mt-1 truncate font-medium capitalize">
                    {selectedRun.policy}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-md border border-border bg-card/68 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold">Issues in this run</h3>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  {selectedIssues.map((issue) => (
                    <div
                      key={issue.id}
                      className="rounded border border-border/70 bg-background/58 px-2.5 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Pill className={issueStateClassNames[issue.state]}>
                          {issue.externalKey}
                        </Pill>
                        <p className="min-w-0 break-words text-xs font-medium">
                          {issue.title}
                        </p>
                      </div>
                      <p className="mt-1 break-words text-[11px] text-muted-foreground">
                        {issue.labels.join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-md border border-border bg-card/68 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold">Stage pipeline</h3>
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  {selectedRun.stages.map((stage) => (
                    <StageRow key={stage.id} stage={stage} expanded />
                  ))}
                </div>
              </div>

              {selectedRun.status === 'review' ? (
                <div className="mt-4 rounded-md border border-violet-500/40 bg-violet-500/8 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold">Review handoff</h3>
                    <Pill className="border-violet-500/45 bg-violet-500/12 text-violet-300">
                      Local only
                    </Pill>
                  </div>
                  <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                    Sandcastle committed on a local branch. Convergence has not
                    pushed it or opened a PR yet.
                  </p>
                  <div className="space-y-2">
                    <div className="rounded border border-border/70 bg-background/58 px-2.5 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Inspect branch
                        </span>
                        <CopyButton
                          text={selectedRunCheckoutCommand}
                          label="Copy checkout command"
                          className="h-5 w-5"
                        />
                      </div>
                      <code className="block break-all text-[11px] text-muted-foreground">
                        {selectedRunCheckoutCommand}
                      </code>
                    </div>
                    {selectedRunDiffCommand ? (
                      <div className="rounded border border-border/70 bg-background/58 px-2.5 py-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Review diff
                          </span>
                          <CopyButton
                            text={selectedRunDiffCommand}
                            label="Copy diff command"
                            className="h-5 w-5"
                          />
                        </div>
                        <code className="block break-all text-[11px] text-muted-foreground">
                          {selectedRunDiffCommand}
                        </code>
                      </div>
                    ) : null}
                    <div className="rounded border border-border/70 bg-background/58 px-2.5 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Publish manually
                        </span>
                        <CopyButton
                          text={selectedRunPushCommand}
                          label="Copy push command"
                          className="h-5 w-5"
                        />
                      </div>
                      <code className="block break-all text-[11px] text-muted-foreground">
                        {selectedRunPushCommand}
                      </code>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 rounded-md border border-border bg-card/68 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold">Recent events</h3>
                  <TerminalSquare className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  {selectedRun.recentEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded border border-border/70 bg-background/58 px-2.5 py-2"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium uppercase text-muted-foreground">
                          {event.type}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          #{event.sequence}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
                        {event.message}
                      </p>
                    </div>
                  ))}
                  {selectedRun.recentEvents.length === 0 ? (
                    <p className="rounded border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground">
                      No run events persisted yet.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 rounded-md border border-border bg-card/68 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold">
                    Sandcastle artifacts
                  </h3>
                  <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="space-y-2 text-[11px] text-muted-foreground">
                  <div className="flex min-w-0 items-start gap-2">
                    <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 break-words">
                      {selectedRun.commits.length > 0
                        ? `${selectedRun.commits.length} local commit${selectedRun.commits.length === 1 ? '' : 's'} on the Sandcastle branch`
                        : 'No commits recorded yet'}
                    </span>
                  </div>
                  {selectedRun.commits.map((commit) => (
                    <div
                      key={commit}
                      className="ml-5 rounded border border-border/70 bg-background/58 px-2 py-1 font-mono text-[10px]"
                    >
                      {commit}
                    </div>
                  ))}
                  <div className="flex min-w-0 items-start gap-2">
                    <GitBranch className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 break-all">
                      {selectedRun.branchName}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-start gap-2">
                    <FileCode className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 break-all">
                      {selectedRun.logFilePath}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-start gap-2">
                    <Route className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 break-all">
                      {selectedRun.repoPath}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onStopRun(selectedRun.id)}
                  disabled={
                    selectedRun.status !== 'running' &&
                    selectedRun.status !== 'starting'
                  }
                >
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled
                  title="Diff action will be wired after the review handoff flow."
                >
                  <GitCommitHorizontal className="h-3.5 w-3.5" />
                  Diff
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled
                  title="PR creation will be wired after push/writeback support."
                >
                  <GitPullRequest className="h-3.5 w-3.5" />
                  PR
                </Button>
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-card/68 px-3 py-2 text-xs">
                <Layers3 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1 leading-relaxed text-muted-foreground">
                  Global Workboard created a local Sandcastle branch. It has not
                  pushed or opened a PR yet.
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-card/68 px-3 py-2 text-xs">
                <SearchCheck className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  Manual check: verify tracker labels and `.sandcastle`
                  readiness.
                </span>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-border bg-card/68 p-4">
              <h2 className="text-sm font-semibold">No active run selected</h2>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Configure Linear/Jira sources and project mappings in global
                Workboard settings, then sync trackers to compose runs.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={onOpenSettings}
              >
                <Settings2 className="h-3.5 w-3.5" />
                Workboard settings
              </Button>
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}
