import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { PullRequestService } from '../pull-request/pull-request.service'
import { classifyGithubCliError } from '../pull-request/github-cli.pure'
import type { WorkLedgerService } from '../work-ledger/work-ledger.service'
import type { CrewHailService } from '../relay/crew-hail.service'
import type {
  ReleaseAct,
  ReleaseMergeInput,
  ReleasePlan,
  ReleaseProgress,
  ReleaseSeat,
} from '../../../src/shared/types/release.types'
import { mergeVerdict, reviewedByWave } from './release-act.pure'

interface Dependencies {
  db: Database.Database
  prs: Pick<PullRequestService, 'viewForMerge' | 'merge' | 'releaseRuns'>
  ledger: Pick<WorkLedgerService, 'list' | 'currentView' | 'append'>
  hails: Pick<CrewHailService, 'raise'>
  /** Returns the repository path only for a current mastermind member. */
  authorize: (seat: ReleaseSeat) => string
  changed: (crewId: string) => void
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

/** Serial executor: one crew owns the rite until its last bot run settles. */
export class ReleaseActService {
  private readonly plans = new Map<string, { plan: ReleasePlan; cwd: string }>()
  private readonly running = new Map<string, number | null>()
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(private readonly deps: Dependencies) {
    this.now = deps.now ?? Date.now
    this.sleep =
      deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  acts(seat: ReleaseSeat): ReleaseProgress {
    this.deps.authorize(seat)
    return this.progress(seat.crewId)
  }

  private progress(crewId: string): ReleaseProgress {
    const acts = this.deps.db
      .prepare(
        `SELECT id, crew_id AS crewId, issue_id AS issueId,
      pr_number AS prNumber, head_sha AS headSha, requested_at AS requestedAt,
      started_at AS startedAt, completed_at AS completedAt, outcome, error
      FROM release_acts WHERE crew_id=? ORDER BY requested_at, rowid`,
      )
      .all(crewId) as ReleaseAct[]
    return {
      acts,
      running: this.running.has(crewId),
      waitingFor: this.running.get(crewId) ?? null,
    }
  }

  async plan(seat: ReleaseSeat): Promise<ReleasePlan> {
    const cwd = this.deps.authorize(seat)
    const progress = this.progress(seat.crewId)
    const plan: ReleasePlan = {
      ...progress,
      id: randomUUID(),
      candidates: [],
      unavailable: false,
    }
    const numbers = new Set<number>()
    for (const entry of reviewedByWave(this.deps.ledger.list(seat.crewId))) {
      const prNumber = entry.pr!.number
      if (numbers.has(prNumber)) continue
      numbers.add(prNumber)
      const interrupted =
        !progress.running &&
        progress.acts.some(
          (act) =>
            act.issueId === entry.issueId &&
            (act.outcome === 'pending' || act.outcome === 'running'),
        )
      try {
        const reading = await this.deps.prs.viewForMerge(prNumber, cwd)
        plan.candidates.push({
          ...reading,
          issueId: entry.issueId,
          prNumber,
          wave: entry.wave,
          verdict:
            reading.url.toLowerCase() !== entry.pr!.url.toLowerCase()
              ? 'PR repository mismatch'
              : interrupted
                ? 'interrupted — check GitHub'
                : entry.fact.merged
                  ? `merged ${entry.fact.merged.headSha.slice(0, 7)}`
                  : mergeVerdict(reading),
        })
      } catch (error) {
        if (classifyGithubCliError(error as Error) !== 'gh-unavailable')
          throw error
        plan.unavailable = true
        plan.candidates.push({
          issueId: entry.issueId,
          prNumber,
          wave: entry.wave,
          title: entry.issueTitle,
          url: entry.pr!.url,
          headSha: '',
          mergeCommit: null,
          mergeStateStatus: 'UNKNOWN',
          verify: 'missing',
          verdict: 'gh not found',
        })
      }
    }
    // One reviewable plan per seat. A later sheet replaces its previous reading.
    this.plans.set(`${seat.crewId}:${seat.sessionId}`, { plan, cwd })
    return plan
  }

  async merge(input: ReleaseMergeInput): Promise<ReleaseProgress> {
    const cwd = this.deps.authorize(input)
    if (this.running.has(input.crewId)) throw new Error('a merge is running')
    const key = `${input.crewId}:${input.sessionId}`
    const stored = this.plans.get(key)
    if (!stored || stored.plan.id !== input.planId || stored.cwd !== cwd)
      throw new Error('Open a fresh merge plan')
    const selected = new Set(input.issueIds)
    const candidates = stored.plan.candidates.filter((row) =>
      selected.has(row.issueId),
    )
    if (
      stored.plan.unavailable ||
      candidates.length === 0 ||
      candidates.length !== selected.size ||
      candidates.some((row) => row.verdict !== 'mergeable')
    ) {
      throw new Error('Select mergeable PRs only')
    }
    this.running.set(input.crewId, null)
    this.plans.delete(key)
    const acts = candidates.map(
      (candidate): ReleaseAct => ({
        id: randomUUID(),
        crewId: input.crewId,
        issueId: candidate.issueId,
        prNumber: candidate.prNumber,
        headSha: candidate.headSha,
        requestedAt: this.stamp(),
        startedAt: null,
        completedAt: null,
        outcome: 'pending',
        error: null,
      }),
    )
    try {
      this.deps.db.transaction(() => {
        const insert = this.deps.db.prepare(`INSERT INTO release_acts
          (id,crew_id,kind,issue_id,pr_number,head_sha,requested_at,outcome) VALUES (?,?,'merge',?,?,?,?,'pending')`)
        for (const act of acts)
          insert.run(
            act.id,
            act.crewId,
            act.issueId,
            act.prNumber,
            act.headSha,
            act.requestedAt,
          )
      })()
      this.deps.changed(input.crewId)
      for (const [index, candidate] of candidates.entries()) {
        const act = acts[index]
        try {
          this.deps.authorize(input)
          const entry = this.deps.ledger
            .list(input.crewId)
            .find((row) => row.issueId === candidate.issueId)
          if (
            !entry ||
            entry.state !== 'reviewed' ||
            entry.blocked ||
            entry.pr?.number !== candidate.prNumber ||
            entry.fact.merged
          ) {
            this.finish(act, 'skipped', 'no longer awaiting merge')
            continue
          }
          const reading = await this.deps.prs.viewForMerge(
            candidate.prNumber,
            cwd,
          )
          const verdict =
            reading.url.toLowerCase() !== candidate.url.toLowerCase()
              ? 'PR repository mismatch'
              : reading.headSha !== candidate.headSha
                ? 'head SHA moved'
                : mergeVerdict(reading)
          if (verdict !== 'mergeable') {
            this.finish(act, 'skipped', verdict)
            continue
          }
          this.deps.db
            .prepare(
              "UPDATE release_acts SET outcome='running', started_at=? WHERE id=?",
            )
            .run(this.stamp(), act.id)
          await this.deps.prs.merge(candidate.prNumber, reading.headSha, cwd)
          this.finish(act, 'merged', null)
          try {
            // Append against the latest local fact after the await, never overwrite a tracker observation.
            const current = this.deps.ledger
              .currentView(input.crewId)
              .find((row) => row.issueId === candidate.issueId)
            if (!current) throw new Error('Merged PR has no ledger row')
            this.deps.ledger.append([
              {
                ...current,
                seenAt: this.stamp(),
                fact: {
                  ...current.fact,
                  merged: {
                    headSha: reading.headSha,
                    prNumber: candidate.prNumber,
                  },
                },
              },
            ])
          } catch (error) {
            this.note(act, error)
          }
          this.running.set(input.crewId, candidate.prNumber)
          this.notify(act)
          const merged = await this.deps.prs.viewForMerge(
            candidate.prNumber,
            cwd,
          )
          if (!merged.mergeCommit)
            throw new Error('Merged commit missing — check GitHub')
          await this.waitForChangesets(cwd, merged.mergeCommit)
          this.running.set(input.crewId, null)
        } catch (error) {
          const missing =
            classifyGithubCliError(error as Error) === 'gh-unavailable'
          const message = missing
            ? 'gh not found — merge by hand'
            : error instanceof Error
              ? error.message
              : String(error)
          const merged = act.outcome === 'merged'
          if (merged) this.note(act, message)
          else this.finish(act, 'failed', message)
          for (const pending of acts.slice(index + 1))
            this.finish(pending, 'skipped', `stopped after #${act.prNumber}`)
          if (!missing)
            this.deps.hails.raise({
              crewId: input.crewId,
              sessionId: input.sessionId,
              reason: 'release-failed',
              detail: merged
                ? `Merge #${act.prNumber} completed; follow-up failed: ${message}`
                : `Merge #${act.prNumber} failed: ${message}`,
            })
          break
        }
      }
    } finally {
      this.running.delete(input.crewId)
      this.notify(acts.at(-1)!)
    }
    return this.progress(input.crewId)
  }

  private notify(act: ReleaseAct): void {
    try {
      this.deps.changed(act.crewId)
    } catch (error) {
      this.note(act, error)
    }
  }

  private note(act: ReleaseAct, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    const note = act.error ? `${act.error}; ${message}` : message
    this.deps.db
      .prepare('UPDATE release_acts SET error=? WHERE id=?')
      .run(note, act.id)
    act.error = note
  }

  private async waitForChangesets(cwd: string, headSha: string): Promise<void> {
    const deadline = this.now() + 6 * 60_000
    while (this.now() < deadline) {
      const runs = await this.deps.prs.releaseRuns(cwd)
      const run = runs.find((row) => row.headSha === headSha)
      if (run?.status === 'completed') {
        if (run.conclusion !== 'success')
          throw new Error(`changesets run ${run.conclusion || 'failed'}`)
        return
      }
      await this.sleep(10_000)
    }
    throw new Error('changesets run did not complete')
  }

  private stamp(): string {
    return new Date(this.now()).toISOString()
  }

  private finish(
    act: ReleaseAct,
    outcome: ReleaseAct['outcome'],
    error: string | null,
  ): void {
    this.deps.db
      .prepare(
        'UPDATE release_acts SET outcome=?, error=?, completed_at=? WHERE id=?',
      )
      .run(outcome, error, this.stamp(), act.id)
    act.outcome = outcome
    act.error = error
  }
}
