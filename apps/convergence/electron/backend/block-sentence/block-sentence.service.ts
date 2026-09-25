import { randomUUID } from 'crypto'
import type { OneShotInput, OneShotResult } from '../provider/provider.types'
import type { ConversationItem } from '../session/conversation-item.types'
import {
  blocksToDescribe,
  type TurnWorkBlock,
} from './block-sentence-blocks.pure'
import {
  acceptBlockSentence,
  blockRecordsFromItems,
  buildBlockPrompt,
  buildBlockSentenceOneShotInput,
  LUNA_MODEL_ID,
} from './block-sentence.pure'
import type { BlockSentenceRepository } from './block-sentence.repository'

/** The Codex provider's helper turn, when it can take one (A1). */
export interface BlockSentenceModel {
  oneShot(input: OneShotInput): Promise<OneShotResult>
}

export interface BlockSentenceServiceDeps {
  repository: Pick<BlockSentenceRepository, 'has' | 'insert'>
  /** The finished turn's items, in sequence order. */
  turnItems(sessionId: string, turnId: string): ConversationItem[]
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

/**
 * The model sentence for closed work blocks (MAR-3395 CV3).
 *
 * A single app-wide queue (Producer-Consumer): a finished turn is enqueued
 * and nothing else happens on the caller's path; one consumer folds it, asks
 * for one block at a time, checks the line and stores what passes. Failures
 * are silent -- a block without a sentence shows its facts, as before.
 */
export class BlockSentenceService {
  private readonly turns: Array<{ sessionId: string; turnId: string }> = []
  private draining: Promise<void> | null = null

  constructor(private readonly deps: BlockSentenceServiceDeps) {}

  /** A turn ended (R2): queue it when the switch is on and a model exists. */
  turnEnded(sessionId: string, turnId: string): void {
    if (!this.deps.isEnabled()) return
    if (!this.deps.model()) return
    this.turns.push({ sessionId, turnId })
    this.drain()
  }

  /** Resolves when the queue is empty (tests, shutdown). */
  async whenIdle(): Promise<void> {
    while (this.draining) await this.draining
  }

  private drain(): void {
    if (this.draining) return
    this.draining = (async () => {
      // Off the caller's path: the turn-end handler has already returned.
      await Promise.resolve()
      for (let turn = this.turns.shift(); turn; turn = this.turns.shift())
        await this.describeTurn(turn.sessionId, turn.turnId)
    })()
      .catch(() => {})
      .finally(() => {
        this.draining = null
      })
  }

  private async describeTurn(sessionId: string, turnId: string) {
    if (this.deps.isTurnActive(sessionId, turnId)) return
    const blocks = blocksToDescribe(
      this.deps.turnItems(sessionId, turnId),
      (firstItemId) => this.deps.repository.has(sessionId, firstItemId),
    )
    for (const block of blocks) {
      const outcome = await this.describeBlock(sessionId, block)
      // A call that failed (signed out, refused, timed out) will fail for the
      // rest of this turn too: stop spending on it.
      if (outcome === 'call-failed') return
    }
  }

  private async describeBlock(
    sessionId: string,
    block: TurnWorkBlock,
  ): Promise<'stored' | 'skipped' | 'call-failed'> {
    // The switch and the model are read again per block: turning it Off
    // stops the queue at the next block, not after the turn.
    if (!this.deps.isEnabled()) return 'skipped'
    const model = this.deps.model()
    if (!model) return 'skipped'
    if (this.deps.repository.has(sessionId, block.firstItemId)) return 'skipped'

    const built = buildBlockPrompt(
      this.deps.promptText,
      block.members[0]!.providerMeta.providerId,
      blockRecordsFromItems(block.members),
    )
    if (!built) return 'skipped'

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
    } catch {
      return 'call-failed'
    }

    // R3: the gate runs before storage; a failing line is dropped for good.
    const sentence = acceptBlockSentence(text, built.truth)
    if (!sentence) return 'skipped'
    const stored = this.deps.repository.insert({
      sessionId,
      firstItemId: block.firstItemId,
      lastItemId: block.lastItemId,
      sentence,
      model: LUNA_MODEL_ID,
      createdAt: (this.deps.now ?? (() => new Date().toISOString()))(),
    })
    if (!stored) return 'skipped'
    this.deps.onChanged(sessionId)
    return 'stored'
  }
}
