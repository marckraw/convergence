import { randomUUID } from 'crypto'
import type { OneShotInput, OneShotResult } from '../provider/provider.types'
import type { ConversationItem } from '../session/conversation-item.types'
import { failureClass, refusedText } from './block-sentence-attempt.pure'
import type { BlockSentenceAttemptRepository } from './block-sentence-attempt.repository'
import {
  blocksToDescribe,
  closedBlocksSince,
  closesWorkBlock,
  type TurnWorkBlock,
} from './block-sentence-blocks.pure'
import {
  acceptBlockSentence,
  BLOCK_SENTENCE_MAX_PER_TURN,
  blockRecords,
  buildBlockPrompt,
  buildBlockSentenceOneShotInput,
  LUNA_MODEL_ID,
  promptProviderName,
  truthCheck,
} from './block-sentence.pure'
import type { BlockSentenceRepository } from './block-sentence.repository'
import type {
  BlockSentenceAttempt,
  BlockSentenceTrigger,
} from './block-sentence.types'

/** The Codex provider's helper turn, when it can take one (A1). */
export interface BlockSentenceModel {
  oneShot(input: OneShotInput): Promise<OneShotResult>
}

export interface BlockSentenceServiceDeps {
  repository: Pick<BlockSentenceRepository, 'has' | 'insert'>
  /** Every request's row (MAR-3422 CV3d R3). */
  attempts: Pick<BlockSentenceAttemptRepository, 'insert' | 'hasRefusal'>
  /** The finished turn's items, in sequence order. */
  turnItems(sessionId: string, turnId: string): ConversationItem[]
  /**
   * A running turn's items after `afterSequence`, in sequence order (R4): a
   * boundary reads only what the previous one did not fold.
   */
  turnItemsSince(
    sessionId: string,
    turnId: string,
    afterSequence: number,
  ): ConversationItem[]
  /** True while the turn is still the session's running turn. */
  isTurnActive(sessionId: string, turnId: string): boolean
  /** Settings -> "Describe work blocks" (R6). */
  isEnabled(): boolean
  /**
   * The Codex provider when a helper turn can run: a binary that passes the
   * resident-server gate. Null means no request is made (A1).
   */
  model(): BlockSentenceModel | null
  /** A scratch directory for the helper turn; never a project. */
  workingDirectory(): string
  /** `block-sentence.prompt.txt`, verbatim (A3). */
  promptText: string
  onChanged(sessionId: string): void
  now?: () => string
  requestId?: () => string
}

type Job = {
  trigger: BlockSentenceTrigger
  sessionId: string
  turnId: string
  /** When this job joined the queue: the wait its requests report. */
  queuedAt: string
}

/** What main remembers about a running turn between its boundaries. */
interface TurnProgress {
  /** The last boundary folded with nothing undecided before it (R4). */
  cursor: number
  /** Requests made for this turn, on either trigger (R2's cap). */
  requests: number
}

type BlockOutcome = 'stored' | 'refused' | 'call-failed' | 'skipped'

const turnKey = (sessionId: string, turnId: string) =>
  `${sessionId}\u0000${turnId}`

/**
 * The model sentence for closed work blocks (MAR-3395 CV3, MAR-3422 CV3d).
 *
 * A single app-wide queue (Producer-Consumer). Two producers, both off the
 * caller's path: a boundary recorded in a running turn (a block may just
 * have closed), and a turn ending (the trailing block, and anything a
 * boundary could not settle). One consumer takes one job at a time, folds,
 * asks for one block at a time, checks the line, stores what passes and
 * writes a row for every request. Failures are silent to the transcript --
 * a block without a sentence shows its facts, as before -- and never the
 * queue's: one job failing ends that job, not the ones behind it.
 */
export class BlockSentenceService {
  private readonly jobs: Job[] = []
  /** Running turns with a `block-closed` job already queued (R4). */
  private readonly waiting = new Set<string>()
  private readonly progress = new Map<string, TurnProgress>()
  private draining: Promise<void> | null = null
  private stopped = false

  constructor(private readonly deps: BlockSentenceServiceDeps) {}

  /**
   * An item was recorded in a running turn (R1, R4). Called from the insert
   * path, so it reads nothing: when the item can close a block and the turn
   * has no job waiting, it queues one and returns. The switch, the model and
   * the fold are the consumer's.
   */
  itemRecorded(sessionId: string, turnId: string, item: ConversationItem) {
    if (this.stopped) return
    if (!closesWorkBlock(item)) return
    const key = turnKey(sessionId, turnId)
    if (this.waiting.has(key)) return
    this.waiting.add(key)
    this.enqueue('block-closed', sessionId, turnId)
  }

  /** A turn ended (R2): queue it when the switch is on and a model exists. */
  turnEnded(sessionId: string, turnId: string): void {
    if (!this.deps.isEnabled() || !this.model()) {
      // Nothing more will be asked for this turn: forget its progress.
      this.progress.delete(turnKey(sessionId, turnId))
      return
    }
    this.enqueue('turn-ended', sessionId, turnId)
  }

  /**
   * The app is quitting (R12): what is queued is dropped, and from here on
   * the model is never asked for -- so no helper turn, and no fresh
   * `codex app-server` host, is started while the app goes down. A request
   * already in flight finishes, but neither its answer nor its attempt row
   * is written.
   */
  stop(): void {
    this.stopped = true
    this.jobs.length = 0
    this.waiting.clear()
    this.progress.clear()
  }

  /** Resolves when the queue is empty (tests, shutdown). */
  async whenIdle(): Promise<void> {
    while (this.draining) await this.draining
  }

  private now(): string {
    return (this.deps.now ?? (() => new Date().toISOString()))()
  }

  private enqueue(
    trigger: BlockSentenceTrigger,
    sessionId: string,
    turnId: string,
  ): void {
    this.jobs.push({ trigger, sessionId, turnId, queuedAt: this.now() })
    this.drain()
  }

  /** The Codex helper, or null once stopped: the one door to a request. */
  private model(): BlockSentenceModel | null {
    return this.stopped ? null : this.deps.model()
  }

  private drain(): void {
    if (this.draining) return
    this.draining = this.consume().finally(() => {
      this.draining = null
      // R10: a job queued after the loop found the queue empty, but before
      // this cleared `draining`, was refused a new consumer; start it now.
      if (this.jobs.length > 0) this.drain()
    })
  }

  private async consume(): Promise<void> {
    // Off the caller's path: the recording or turn-end handler has returned.
    await Promise.resolve()
    for (let job = this.jobs.shift(); job; job = this.jobs.shift()) {
      try {
        if (job.trigger === 'block-closed') {
          // Taken before the read: a boundary recorded while this job runs
          // queues exactly one more (R4).
          this.waiting.delete(turnKey(job.sessionId, job.turnId))
          await this.describeClosedBlocks(job)
        } else {
          await this.describeTurn(job)
        }
      } catch {
        // R10: this job is done -- its session deleted mid-request, its
        // items unreadable. The jobs behind it are still asked for.
      }
    }
  }

  /** The progress of a running turn; a session's older turns are dropped. */
  private progressFor(sessionId: string, turnId: string): TurnProgress {
    const key = turnKey(sessionId, turnId)
    const known = this.progress.get(key)
    if (known) return known
    for (const other of this.progress.keys())
      if (other.startsWith(`${sessionId}\u0000`)) this.progress.delete(other)
    const fresh: TurnProgress = { cursor: 0, requests: 0 }
    this.progress.set(key, fresh)
    return fresh
  }

  /**
   * R1: the blocks a boundary closed, read from the last cursor on. Only
   * while the turn still runs: a finished turn is the turn end's alone, and
   * its sweep is the one that checks for a stored or refused line. A job
   * that outlived its turn (queued behind another session, the turn ended
   * with the switch Off) would otherwise start a fresh cursor at 0 and ask
   * again for a block already asked for.
   */
  private async describeClosedBlocks(job: Job) {
    if (!this.deps.isTurnActive(job.sessionId, job.turnId)) return
    if (!this.deps.isEnabled()) return
    if (!this.model()) return
    const progress = this.progressFor(job.sessionId, job.turnId)
    const { blocks, cursor } = closedBlocksSince(
      this.deps.turnItemsSince(job.sessionId, job.turnId, progress.cursor),
    )
    // Advanced before asking: a block handed out here is never handed out
    // by a later boundary -- a failed call is retried by the turn end only.
    if (cursor !== null) progress.cursor = cursor
    for (const block of blocks) {
      const outcome = await this.describeBlock(job, block, progress)
      if (outcome === 'call-failed') return
    }
  }

  /**
   * R2: the finished turn's blocks that have neither a stored line nor a
   * refused one -- the trailing block, a block a boundary could not settle,
   * and a call that failed mid-turn, asked here once more.
   */
  private async describeTurn(job: Job) {
    if (this.deps.isTurnActive(job.sessionId, job.turnId)) return
    const key = turnKey(job.sessionId, job.turnId)
    const progress = this.progress.get(key) ?? { cursor: 0, requests: 0 }
    this.progress.delete(key)
    const blocks = blocksToDescribe(
      this.deps.turnItems(job.sessionId, job.turnId),
      (firstItemId) =>
        this.deps.repository.has(job.sessionId, firstItemId) ||
        this.deps.attempts.hasRefusal(job.sessionId, firstItemId),
    )
    for (const block of blocks) {
      const outcome = await this.describeBlock(job, block, progress)
      // A call that failed (signed out, refused, timed out) will fail for the
      // rest of this turn too: stop spending on it.
      if (outcome === 'call-failed') return
    }
  }

  private async describeBlock(
    job: Job,
    block: TurnWorkBlock,
    progress: TurnProgress,
  ): Promise<BlockOutcome> {
    const { sessionId } = job
    // The switch and the model are read again per block: turning it Off
    // stops the queue at the next block, not after the turn.
    if (!this.deps.isEnabled()) return 'skipped'
    if (progress.requests >= BLOCK_SENTENCE_MAX_PER_TURN) return 'skipped'
    const model = this.model()
    if (!model) return 'skipped'
    if (this.deps.repository.has(sessionId, block.firstItemId)) return 'skipped'

    const built = buildBlockPrompt(
      this.deps.promptText,
      promptProviderName(block.members[0]!.providerMeta.providerId),
      blockRecords(block.members),
    )
    if (!built) return 'skipped'

    progress.requests += 1
    const startedAt = this.now()
    const attempt = (
      fields: Pick<BlockSentenceAttempt, 'outcome' | 'refusedText' | 'reasons'>,
    ) =>
      this.deps.attempts.insert({
        sessionId,
        turnId: job.turnId,
        firstItemId: block.firstItemId,
        lastItemId: block.lastItemId,
        trigger: job.trigger,
        queuedAt: job.queuedAt,
        startedAt,
        finishedAt: this.now(),
        ...fields,
      })

    let text: string
    try {
      const result = await model.oneShot(
        buildBlockSentenceOneShotInput({
          prompt: built.prompt,
          workingDirectory: this.deps.workingDirectory(),
          requestId: (this.deps.requestId ?? randomUUID)(),
        }),
      )
      text = result.text
    } catch (error) {
      if (this.stopped) return 'skipped'
      // R3: the class of the failure, never its message.
      attempt({
        outcome: 'call-failed',
        refusedText: null,
        reasons: failureClass(error),
      })
      return 'call-failed'
    }
    // R12: an answer that lands after quit began is not written.
    if (this.stopped) return 'skipped'

    // R3: the gate runs before storage; a failing line is dropped for good,
    // and its row says why.
    const sentence = acceptBlockSentence(text, built.truth)
    if (!sentence) {
      attempt({
        outcome: 'refused',
        refusedText: refusedText(text),
        reasons: JSON.stringify(
          truthCheck(text.trim(), { truth: built.truth }).reasons,
        ),
      })
      return 'refused'
    }
    const stored = this.deps.repository.insert({
      sessionId,
      firstItemId: block.firstItemId,
      lastItemId: block.lastItemId,
      sentence,
      model: LUNA_MODEL_ID,
      createdAt: this.now(),
    })
    attempt({ outcome: 'stored', refusedText: null, reasons: null })
    if (!stored) return 'skipped'
    this.deps.onChanged(sessionId)
    return 'stored'
  }
}
