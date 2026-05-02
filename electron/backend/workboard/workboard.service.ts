import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { join } from 'path'
import { WorkboardRepository } from './workboard.repository'
import {
  deriveIssueStateFromLabels,
  hasWorkboardVisibilityLabel,
  normalizeIssuePriority,
} from './tracker/tracker-state.pure'
import { JiraWorkboardProvider } from './tracker/jira.provider'
import { LinearWorkboardProvider } from './tracker/linear.provider'
import type { WorkboardTrackerProvider } from './tracker/tracker.types'
import { findMappingForIssue } from './workboard-mapping.pure'
import { SandcastleReadinessService } from './sandcastle/readiness.service'
import {
  SandcastleLibraryRunAdapter,
  type SandcastleRunAdapter,
  type SandcastleRunAdapterEvent,
  type SandcastleSmokeRunResult,
} from './sandcastle/runner.service'
import type {
  StartWorkboardRunInput,
  UpsertWorkboardProjectMappingInput,
  UpsertWorkboardTrackerSourceInput,
  WorkboardActiveRun,
  WorkboardEventRecord,
  WorkboardIssueCandidate,
  WorkboardProjectMappingRecord,
  WorkboardProjectMappingWithProjectRecord,
  WorkboardProjectGroup,
  WorkboardSnapshot,
  WorkboardStageRun,
  WorkboardStageRecord,
  WorkboardTrackerIssueRecord,
  WorkboardTrackerSourceRecord,
  WorkboardStartRunResult,
} from './workboard.types'

export class WorkboardService {
  private providers: Map<string, WorkboardTrackerProvider>
  private snapshotListener: ((snapshot: WorkboardSnapshot) => void) | null =
    null
  private activeRunControllers = new Map<string, AbortController>()

  constructor(
    private repository: WorkboardRepository,
    providers: WorkboardTrackerProvider[] = [
      new LinearWorkboardProvider(),
      new JiraWorkboardProvider(),
    ],
    private readiness: SandcastleReadinessService = new SandcastleReadinessService(),
    private runner: SandcastleRunAdapter = new SandcastleLibraryRunAdapter(),
  ) {
    this.providers = new Map(
      providers.map((provider) => [provider.type, provider]),
    )
  }

  setSnapshotListener(listener: (snapshot: WorkboardSnapshot) => void): void {
    this.snapshotListener = listener
  }

  getSnapshot(): WorkboardSnapshot {
    const sources = this.repository.listTrackerSources()
    const issues = this.repository.listTrackerIssues()
    const mappings = this.repository.listProjectMappingsWithProjects()
    const issuesBySource = new Map<string, WorkboardTrackerIssueRecord[]>()
    for (const issue of issues) {
      const bucket = issuesBySource.get(issue.sourceId) ?? []
      bucket.push(issue)
      issuesBySource.set(issue.sourceId, bucket)
    }

    const candidates = issues
      .filter((issue) => hasWorkboardVisibilityLabel(issue.labels))
      .map((issue) => this.issueToCandidate(issue, sources, mappings))

    const activeRuns = this.buildActiveRuns()

    return {
      selectedRunId: '',
      trackerSources: sources.map((source) => {
        const sourceIssues = issuesBySource.get(source.id) ?? []
        return {
          id: source.id,
          type: source.type,
          name: source.name,
          status: source.lastSyncError ? 'needs-auth' : 'connected',
          scope: this.describeSourceScope(source),
          syncedAt: source.lastSyncError
            ? 'Sync failed'
            : (source.lastSyncAt ?? 'Never synced'),
          candidateCount: sourceIssues.filter((issue) =>
            hasWorkboardVisibilityLabel(issue.labels),
          ).length,
        }
      }),
      candidates,
      projectGroups: this.buildProjectGroups(candidates, mappings),
      activeRuns,
    }
  }

  async syncSources(): Promise<WorkboardSnapshot> {
    const sources = this.repository
      .listTrackerSources()
      .filter((source) => source.enabled)

    for (const source of sources) {
      const provider = this.providers.get(source.type)
      if (!provider) {
        this.repository.setTrackerSourceSyncResult(
          source.id,
          `No Workboard provider registered for ${source.type}`,
        )
        continue
      }

      this.repository.setTrackerSourceSyncing(source.id)
      try {
        const issues = await provider.syncSource(source)
        this.repository.upsertTrackerIssues(source.id, issues)
        this.repository.setTrackerSourceSyncResult(source.id, null)
      } catch (err) {
        this.repository.setTrackerSourceSyncResult(
          source.id,
          err instanceof Error ? err.message : 'Unknown tracker sync error',
        )
      }
    }

    return this.getSnapshot()
  }

  listTrackerSources(): WorkboardTrackerSourceRecord[] {
    return this.repository.listTrackerSources()
  }

  upsertTrackerSource(
    input: UpsertWorkboardTrackerSourceInput,
  ): WorkboardTrackerSourceRecord {
    return this.repository.upsertTrackerSource(input)
  }

  listProjectMappings(): WorkboardProjectMappingRecord[] {
    return this.repository.listProjectMappings()
  }

  upsertProjectMapping(
    input: UpsertWorkboardProjectMappingInput,
  ): WorkboardProjectMappingRecord {
    return this.repository.upsertProjectMapping(input)
  }

  async startRun(
    input: StartWorkboardRunInput,
  ): Promise<WorkboardStartRunResult> {
    const normalizedIssueIds = [...new Set(input.issueIds)].filter(Boolean)
    if (normalizedIssueIds.length !== 1) {
      throw new Error('Phase 5 supports exactly one issue per smoke run')
    }

    const issue = this.repository.getTrackerIssue(normalizedIssueIds[0])
    if (!issue) {
      throw new Error(`Workboard issue not found: ${normalizedIssueIds[0]}`)
    }

    const mappings = this.repository.listProjectMappingsWithProjects()
    const mapping = findMappingForIssue(mappings, issue)
    if (!mapping) {
      throw new Error(`No project mapping found for ${issue.externalKey}`)
    }
    if (mapping.projectId !== input.projectId) {
      throw new Error(`${issue.externalKey} is not mapped to this project`)
    }
    if (mapping.workflowPolicy !== 'simple-loop') {
      throw new Error('Phase 5 only supports the simple-loop workflow')
    }

    const source = this.repository
      .listTrackerSources()
      .find((candidate) => candidate.id === issue.sourceId)
    if (!source) {
      throw new Error(`Tracker source not found for ${issue.externalKey}`)
    }

    const sandboxMode = input.sandboxMode ?? mapping.sandboxMode
    const readiness = this.readiness.checkProject({
      projectId: mapping.projectId,
      repoPath: mapping.repositoryPath,
      workflowPolicy: mapping.workflowPolicy,
      sandboxMode,
    })
    if (readiness.status !== 'ready') {
      throw new Error(
        `Project is not Sandcastle-ready yet: ${readiness.status}`,
      )
    }

    const runId = randomUUID()
    const branchName = buildBranchName(
      mapping.branchPrefix,
      source.type,
      issue.externalKey,
      issue.title,
    )
    const logRoot = join(
      mapping.repositoryPath,
      '.sandcastle',
      'logs',
      'convergence',
      runId,
    )
    const providerDefaults = resolveProviderDefaults(mapping.stageDefaults)
    const providerId = input.providerId ?? providerDefaults.providerId
    const model = input.model ?? providerDefaults.model
    const effort = input.effort ?? providerDefaults.effort
    const maxIterations = input.maxIterations ?? providerDefaults.maxIterations
    const logFilePath = join(logRoot, 'implementer.log')
    const now = new Date().toISOString()

    this.repository.createRun({
      id: runId,
      projectId: mapping.projectId,
      status: 'starting',
      workflowPolicy: mapping.workflowPolicy,
      sandboxMode,
      branchStrategy: 'branch',
      branchName,
      repoPath: mapping.repositoryPath,
      logRoot,
      progress: { percent: 5 },
      startedAt: now,
    })
    this.repository.addRunIssues(runId, [issue.id], branchName)
    const stage = this.repository.createStage({
      id: `${runId}:implementer`,
      runId,
      role: 'implementer',
      status: 'waiting',
      providerId,
      model,
      effort,
      maxIterations,
      logFilePath,
    })
    this.repository.appendEvent({
      runId,
      stageId: stage.id,
      type: 'lifecycle',
      message: `Queued Sandcastle smoke run for ${issue.externalKey}`,
      payload: { branchName, providerId, model },
    })

    const controller = new AbortController()
    this.activeRunControllers.set(runId, controller)
    this.notifySnapshotChange()
    void this.executeRun({
      runId,
      stageId: stage.id,
      issue,
      source,
      mapping,
      providerId,
      model,
      effort,
      maxIterations,
      logFilePath,
      sandboxMode,
      signal: controller.signal,
    })

    return { runId, snapshot: this.getSnapshot() }
  }

  stopRun(runId: string): WorkboardSnapshot {
    const controller = this.activeRunControllers.get(runId)
    if (!controller) {
      throw new Error(`No active Workboard run controller for ${runId}`)
    }

    this.repository.updateRun({
      id: runId,
      status: 'stopping',
      progress: { percent: 85 },
    })
    this.repository.appendEvent({
      runId,
      type: 'lifecycle',
      message: 'Stop requested from Agent Workboard',
    })
    controller.abort(new Error('Stop requested from Agent Workboard'))
    this.notifySnapshotChange()
    return this.getSnapshot()
  }

  getRunEvents(runId: string): WorkboardEventRecord[] {
    return this.repository.listRunEvents(runId)
  }

  private async executeRun(input: {
    runId: string
    stageId: string
    issue: WorkboardTrackerIssueRecord
    source: WorkboardTrackerSourceRecord
    mapping: WorkboardProjectMappingWithProjectRecord
    providerId: 'claude-code' | 'codex'
    model: string
    effort: string | null
    maxIterations: number
    logFilePath: string
    sandboxMode: string
    signal: AbortSignal
  }): Promise<void> {
    try {
      const startedAt = new Date().toISOString()
      this.repository.updateRun({
        id: input.runId,
        status: 'running',
        progress: { percent: 15 },
        startedAt,
      })
      this.repository.updateStage({
        id: input.stageId,
        status: 'running',
        startedAt,
      })
      this.repository.appendEvent({
        runId: input.runId,
        stageId: input.stageId,
        type: 'lifecycle',
        message: 'Sandcastle library run started',
      })
      this.notifySnapshotChange()

      const result = await this.runner.runSmoke({
        cwd: input.mapping.repositoryPath,
        promptFile: resolvePromptFile(input.mapping.repositoryPath),
        promptArgs: buildPromptArgs(input.issue, input.source),
        branchName: this.repository.getRun(input.runId)?.branchName ?? '',
        logFilePath: input.logFilePath,
        sandboxMode: input.sandboxMode,
        providerId: input.providerId,
        model: input.model,
        effort: input.effort,
        maxIterations: input.maxIterations,
        signal: input.signal,
        onEvent: (event) =>
          this.captureRunnerEvent(input.runId, input.stageId, event),
      })

      this.completeRun(input.runId, input.stageId, result)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown Sandcastle run failure'
      const stopped = input.signal.aborted
      const endedAt = new Date().toISOString()
      this.repository.updateStage({
        id: input.stageId,
        status: stopped ? 'stopped' : 'failed',
        error: message,
        endedAt,
      })
      this.repository.updateRun({
        id: input.runId,
        status: stopped ? 'stopped' : 'failed',
        error: message,
        progress: { percent: stopped ? 90 : 100 },
        endedAt,
      })
      this.repository.appendEvent({
        runId: input.runId,
        stageId: input.stageId,
        type: stopped ? 'lifecycle' : 'error',
        message: stopped ? 'Sandcastle run stopped' : message,
      })
    } finally {
      this.activeRunControllers.delete(input.runId)
      this.notifySnapshotChange()
    }
  }

  private captureRunnerEvent(
    runId: string,
    stageId: string,
    event: SandcastleRunAdapterEvent,
  ): void {
    this.repository.appendEvent({
      runId,
      stageId,
      type: event.type,
      message: event.message,
      payload: event.payload,
    })
    this.repository.updateStage({
      id: stageId,
      iterationCount: event.iteration,
    })
    this.repository.updateRun({
      id: runId,
      progress: { percent: Math.min(85, 20 + event.iteration * 20) },
    })
    this.notifySnapshotChange()
  }

  private completeRun(
    runId: string,
    stageId: string,
    result: SandcastleSmokeRunResult,
  ): void {
    const endedAt = new Date().toISOString()
    const nextStatus = result.commits.length > 0 ? 'review' : 'done'
    this.repository.updateStage({
      id: stageId,
      status: 'done',
      iterationCount: result.iterations,
      commitShas: result.commits,
      result: {
        completionSignal: result.completionSignal,
        branch: result.branch,
        logFilePath: result.logFilePath,
        preservedWorktreePath: result.preservedWorktreePath,
      },
      endedAt,
    })
    this.repository.updateRun({
      id: runId,
      status: nextStatus,
      progress: { percent: 100 },
      sandcastleResult: {
        completionSignal: result.completionSignal,
        branch: result.branch,
        commits: result.commits,
        logFilePath: result.logFilePath,
        preservedWorktreePath: result.preservedWorktreePath,
      },
      endedAt,
    })
    this.repository.appendEvent({
      runId,
      stageId,
      type: 'lifecycle',
      message:
        result.commits.length > 0
          ? 'Sandcastle run completed with commits for review'
          : 'Sandcastle run completed without commits',
      payload: { commits: result.commits },
    })
  }

  private issueToCandidate(
    issue: WorkboardTrackerIssueRecord,
    sources: WorkboardTrackerSourceRecord[],
    mappings: WorkboardProjectMappingWithProjectRecord[],
  ): WorkboardIssueCandidate {
    const source = sources.find((candidate) => candidate.id === issue.sourceId)
    const mapping = findMappingForIssue(mappings, issue)
    return {
      id: issue.id,
      trackerType: source?.type ?? 'linear',
      trackerName: source?.name ?? 'Unknown tracker',
      externalKey: issue.externalKey,
      title: issue.title,
      projectName: mapping?.projectName ?? null,
      mappingStatus: mapping ? 'mapped' : 'needs-mapping',
      mappingRule: mapping?.name ?? 'No project mapping configured yet',
      state: deriveIssueStateFromLabels(issue.labels),
      priority: normalizeIssuePriority(issue.priority),
      labels: issue.labels,
      estimate: issue.status || 'ready for mapping',
      summary: issue.body || issue.url,
      updatedAt: issue.updatedAtExternal ?? issue.updatedAt,
    }
  }

  private buildProjectGroups(
    candidates: WorkboardIssueCandidate[],
    mappings: WorkboardProjectMappingWithProjectRecord[],
  ): WorkboardProjectGroup[] {
    const groups = new Map<string, WorkboardProjectGroup>()

    for (const mapping of mappings.filter((item) => item.enabled)) {
      const mappedCandidates = candidates.filter(
        (candidate) =>
          candidate.mappingStatus === 'mapped' &&
          candidate.projectName === mapping.projectName &&
          candidate.mappingRule === mapping.name,
      )
      if (mappedCandidates.length === 0) continue

      const existing = groups.get(mapping.projectId)
      if (existing) {
        existing.candidateIds.push(...mappedCandidates.map((item) => item.id))
        existing.selectedIssueIds.push(
          ...mappedCandidates
            .filter((item) => item.state === 'ready')
            .map((item) => item.id),
        )
        existing.trackerScopes.push(mapping.name)
        continue
      }

      const readiness = this.readiness.checkProject({
        projectId: mapping.projectId,
        repoPath: mapping.repositoryPath,
        workflowPolicy: mapping.workflowPolicy,
        sandboxMode: mapping.sandboxMode,
      })

      groups.set(mapping.projectId, {
        id: mapping.projectId,
        projectId: mapping.projectId,
        projectName: mapping.projectName,
        repoPath: mapping.repositoryPath,
        trackerScopes: [mapping.name],
        workflow:
          mapping.workflowPolicy === 'sequential-reviewer'
            ? 'sequential reviewer'
            : 'simple loop',
        policy:
          mapping.workflowPolicy === 'sequential-reviewer'
            ? 'review-heavy'
            : 'safe smoke',
        sandcastleStatus: readiness.status,
        checks: readiness.checks,
        candidateIds: mappedCandidates.map((item) => item.id),
        selectedIssueIds: mappedCandidates
          .filter((item) => item.state === 'ready')
          .map((item) => item.id),
      })
    }

    return Array.from(groups.values())
  }

  private buildActiveRuns(): WorkboardActiveRun[] {
    return this.repository.listRunsForSnapshot().map((run) => {
      const stages = this.repository.listRunStages(run.id)
      const issues = this.repository.listRunIssues(run.id)
      const events = this.repository.listRunEvents(run.id, 20)
      const stageViewModels = stages.map((stage): WorkboardStageRun => {
        const latestEvent = [...events]
          .reverse()
          .find((event) => event.stageId === stage.id)
        return {
          id: stage.id,
          role: stage.role,
          status: stage.status,
          provider: providerLabel(stage.providerId),
          model: stage.model ?? 'default',
          iteration: stage.iterationCount,
          maxIterations: stage.maxIterations,
          logPreview: stage.error ?? latestEvent?.message ?? 'Waiting',
          elapsed: elapsedLabel(stage.startedAt, stage.endedAt),
        }
      })

      return {
        id: run.id,
        projectName: run.projectName,
        repoPath: run.repoPath,
        workflow:
          run.workflowPolicy === 'sequential-reviewer'
            ? 'sequential reviewer'
            : 'simple loop',
        policy:
          run.workflowPolicy === 'sequential-reviewer'
            ? 'review-heavy'
            : 'safe smoke',
        status: run.status,
        branchStrategy:
          run.branchStrategy === 'branch' ? 'explicit branch' : 'merge-to-head',
        branchName: run.branchName,
        sandbox: run.sandboxMode === 'no-sandbox' ? 'No sandbox' : 'Docker',
        progressPercent: progressPercent(run.progress, run.status),
        issueIds: issues.map((issue) => issue.trackerIssueId),
        currentStage:
          stages.find((stage) => stage.id === run.currentStageId)?.role ??
          stages[0]?.role ??
          'implementer',
        startedAt: run.startedAt ?? run.createdAt,
        logFilePath: stages[0]?.logFilePath ?? run.logRoot,
        commits: extractRunCommits(run.sandcastleResult, stages),
        summary: run.error ?? events.at(-1)?.message ?? 'Sandcastle run queued',
        stages: stageViewModels,
        recentEvents: events.map((event) => ({
          id: event.id,
          stageId: event.stageId,
          sequence: event.sequence,
          type: event.type,
          message: event.message,
          createdAt: event.createdAt,
        })),
      }
    })
  }

  private describeSourceScope(source: WorkboardTrackerSourceRecord): string {
    const explicitScope = source.sync.scope
    if (typeof explicitScope === 'string' && explicitScope.trim()) {
      return explicitScope.trim()
    }

    if (source.type === 'linear') {
      const teamKey = source.sync.teamKey
      const labels = source.sync.labels
      return [
        typeof teamKey === 'string' ? `Team ${teamKey}` : null,
        Array.isArray(labels) ? `labels ${labels.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join(' + ')
    }

    const jql = source.sync.jql
    return typeof jql === 'string' && jql.trim()
      ? `JQL: ${jql.trim()}`
      : 'JQL: labels = convergence-loop'
  }

  private notifySnapshotChange(): void {
    this.snapshotListener?.(this.getSnapshot())
  }
}

function extractRunCommits(
  sandcastleResult: Record<string, unknown>,
  stages: WorkboardStageRecord[],
): string[] {
  const resultCommits = sandcastleResult.commits
  if (
    Array.isArray(resultCommits) &&
    resultCommits.every((commit) => typeof commit === 'string')
  ) {
    return resultCommits
  }

  const stageCommits = stages.flatMap((stage) => stage.commitShas)
  return [...new Set(stageCommits)]
}

function resolveProviderDefaults(stageDefaults: Record<string, unknown>): {
  providerId: 'claude-code' | 'codex'
  model: string
  effort: string | null
  maxIterations: number
} {
  const implementer =
    stageDefaults.implementer &&
    typeof stageDefaults.implementer === 'object' &&
    !Array.isArray(stageDefaults.implementer)
      ? (stageDefaults.implementer as Record<string, unknown>)
      : {}
  const provider = implementer.provider
  const providerId = provider === 'codex' ? 'codex' : 'claude-code'
  const model = typeof implementer.model === 'string' ? implementer.model : null
  const effort =
    typeof implementer.effort === 'string' ? implementer.effort : null
  const maxIterations =
    typeof implementer.maxIterations === 'number'
      ? Math.max(1, Math.floor(implementer.maxIterations))
      : 1

  return {
    providerId,
    model: model ?? (providerId === 'codex' ? 'gpt-5.5' : 'claude-sonnet-4-6'),
    effort,
    maxIterations,
  }
}

function resolvePromptFile(repoPath: string): string {
  const candidates = [
    join(repoPath, '.sandcastle', 'implement-prompt.md'),
    join(repoPath, '.sandcastle', 'prompt.md'),
  ]
  const promptFile = candidates.find((candidate) => existsSync(candidate))
  if (!promptFile) {
    throw new Error('No Sandcastle implement prompt found')
  }
  return promptFile
}

function buildPromptArgs(
  issue: WorkboardTrackerIssueRecord,
  source: WorkboardTrackerSourceRecord,
): Record<string, string> {
  return {
    ISSUE_ID: issue.externalId,
    ISSUE_KEY: issue.externalKey,
    ISSUE_TITLE: issue.title,
    ISSUE_BODY: issue.body,
    ISSUE_URL: issue.url,
    ISSUE_LABELS: issue.labels.join(', '),
    TRACKER_TYPE: source.type,
    TRACKER_NAME: source.name,
  }
}

function buildBranchName(
  prefix: string,
  trackerType: string,
  externalKey: string,
  title: string,
): string {
  const cleanPrefix = sanitizeBranchSegment(prefix || 'sandcastle')
  const cleanTracker = sanitizeBranchSegment(trackerType)
  const cleanKey = sanitizeBranchSegment(externalKey)
  const slug = sanitizeBranchSegment(title).slice(0, 48)
  return `${cleanPrefix}/${cleanTracker}-${cleanKey}-${slug}`
}

function sanitizeBranchSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^-+|-+$/g, '')
    .replace(/\/-+/g, '/')
    .replace(/-+\//g, '/')
}

function providerLabel(providerId: string): WorkboardStageRun['provider'] {
  if (providerId === 'codex') return 'Codex'
  if (providerId === 'claude-code') return 'Claude Code'
  return 'Convergence'
}

function progressPercent(
  progress: Record<string, unknown>,
  status: string,
): number {
  if (typeof progress.percent === 'number') return progress.percent
  if (status === 'done' || status === 'review' || status === 'failed')
    return 100
  if (status === 'running') return 45
  return 10
}

function elapsedLabel(
  startedAt: string | null,
  endedAt: string | null,
): string {
  if (!startedAt) return '0m'
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '0m'
  const minutes = Math.max(0, Math.round((end - start) / 60_000))
  return `${minutes}m`
}
