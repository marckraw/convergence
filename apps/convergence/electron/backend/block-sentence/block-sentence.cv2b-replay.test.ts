import { describe, expect, it } from 'vitest'
import fixtures from '../../../tools/spikes/block-summary/fixtures.json'
import lunaLow from '../../../tools/spikes/block-summary/reports/luna-low.json'
import type { OneShotInput } from '../provider/provider.types'
import type { ConversationItem } from '../session/conversation-item.types'
import { BLOCK_SENTENCE_PROMPT } from './block-sentence.prompt'
import {
  acceptBlockSentence,
  assembleBlockPrompt,
  blockRecordsFromItems,
  buildBlockPrompt,
  promptProviderName,
  type BlockRecord,
} from './block-sentence.pure'
import { BlockSentenceService } from './block-sentence.service'
import type { BlockSentence } from './block-sentence.types'

/**
 * CV2b's real GPT-6 Luna (low) answers, replayed through the app (MAR-3395).
 * The double answers only a prompt byte-identical to the one the spike sent
 * for that block, so a green run means main asks exactly what was measured,
 * and the app's gate keeps exactly what the spike's gate kept.
 *
 * The items are the app's own, not the spike's: a Claude session's provider
 * id is `claude-code` (R11), and a Codex step is what `codex-provider.ts`
 * records for a `commandExecution` -- the command shell-wrapped as Codex
 * sends it, and the output behind a `"<command>: "` prefix (R8).
 */

/** The app's provider id for each spike provider name (R11). */
const APP_PROVIDER_ID: Record<string, string> = { claude: 'claude-code' }
const appProviderId = (spikeName: string) =>
  APP_PROVIDER_ID[spikeName] ?? spikeName

/** `codex-provider.ts`'s `commandExecution` result, for a zsh-wrapped command. */
function codexCommandItem(command: string, output: string) {
  const wrapped = `/bin/zsh -lc '${command.replaceAll(`'`, `'\\''`)}'`
  return { toolName: wrapped, outputText: `${wrapped}: ${output}` }
}

type Fixture = (typeof fixtures)[number]

let sequence = 0

/** Real conversation items that map back to the fixture's records. */
function itemsFor(block: Fixture, withAnswers: boolean): ConversationItem[] {
  const items: ConversationItem[] = []
  for (const [index, record] of (block.items as BlockRecord[]).entries()) {
    sequence += 1
    const base = {
      id: `${block.id}-${index}`,
      sessionId: 's1',
      sequence,
      turnId: 't1',
      state: 'complete' as const,
      createdAt: '2026-09-25T00:00:00.000Z',
      updatedAt: '2026-09-25T00:00:00.000Z',
    }
    if (record.type === 'tool-result') {
      items.push({
        ...base,
        kind: 'tool-result',
        ...codexCommandItem(record.toolName, record.outputText),
        relatedItemId: null,
        providerMeta: {
          providerId: appProviderId(block.provider),
          providerItemId: null,
          providerEventType: 'commandExecution',
        },
      })
      continue
    }
    items.push({
      ...base,
      kind: 'tool-call',
      toolName: record.toolName,
      inputText: record.inputText,
      providerMeta: {
        providerId: appProviderId(block.provider),
        providerItemId: null,
        providerEventType: 'tool-use',
      },
    })
    if (withAnswers) {
      sequence += 1
      items.push({
        ...base,
        id: `${block.id}-${index}-answer`,
        sequence,
        kind: 'tool-result',
        toolName: record.toolName,
        relatedItemId: base.id,
        outputText: 'ok',
        providerMeta: {
          providerId: appProviderId(block.provider),
          providerItemId: null,
          providerEventType: 'tool-result',
        },
      })
    }
  }
  return items
}

const spikePrompt = (block: Fixture) =>
  assembleBlockPrompt(
    BLOCK_SENTENCE_PROMPT,
    block.provider,
    block.items as BlockRecord[],
  )

describe('CV2b replay: the app asks what the spike measured', () => {
  it('maps each fixture block back to its records and builds the spike prompt', () => {
    for (const block of fixtures) {
      const records = blockRecordsFromItems(itemsFor(block, true))
      expect(records, block.id).toEqual(block.items)
      const built = buildBlockPrompt(
        BLOCK_SENTENCE_PROMPT,
        promptProviderName(appProviderId(block.provider)),
        records,
      )!
      expect(built.prompt, block.id).toBe(spikePrompt(block))
      expect(built.truth, block.id).toEqual(block.truth)
    }
  })

  it('keeps and drops exactly the 60 recorded answers the spike gate kept and dropped', () => {
    expect(lunaLow.promptSha256).toBe(
      '3021f53220e111d7a242f3cbec7f982581d941a15befc316d388da08503812c8',
    )
    expect(lunaLow.rows).toHaveLength(60)
    for (const row of lunaLow.rows) {
      const block = fixtures.find((fixture) => fixture.id === row.blockId)!
      expect(
        acceptBlockSentence(row.sentence, block.truth) !== null,
        `${row.id}: ${row.sentence}`,
      ).toBe(row.truthCheck.pass)
    }
  })

  it('stores the recorded run-1 line for every block of three or more members in one real turn', async () => {
    const recorded = new Map(
      lunaLow.rows
        .filter((row) => row.run === 1)
        .map((row) => {
          const block = fixtures.find((fixture) => fixture.id === row.blockId)!
          return [spikePrompt(block), row] as const
        }),
    )
    const turn: ConversationItem[] = []
    for (const block of fixtures) {
      turn.push(...itemsFor(block, true))
      sequence += 1
      turn.push({
        id: `${block.id}-said`,
        sessionId: 's1',
        sequence,
        turnId: 't1',
        state: 'complete',
        createdAt: '2026-09-25T00:00:00.000Z',
        updatedAt: '2026-09-25T00:00:00.000Z',
        providerMeta: {
          providerId: appProviderId(block.provider),
          providerItemId: null,
          providerEventType: 'assistant',
        },
        kind: 'message',
        actor: 'assistant',
        text: 'next',
      })
    }
    const stored: BlockSentence[] = []
    const asked: string[] = []
    const service = new BlockSentenceService({
      repository: {
        has: () => false,
        insert: (row) => (stored.push(row), true),
      },
      turnItems: () => turn,
      isTurnActive: () => false,
      isEnabled: () => true,
      model: () => ({
        oneShot: async (input: OneShotInput) => {
          const row = recorded.get(input.prompt)
          if (!row) throw new Error('prompt differs from the spike prompt')
          asked.push(row.blockId)
          return { text: row.sentence }
        },
      }),
      workingDirectory: () => '/tmp',
      promptText: BLOCK_SENTENCE_PROMPT,
      onChanged: () => {},
    })
    service.turnEnded('s1', 't1')
    await service.whenIdle()

    const eligible = fixtures
      .filter((block) => itemsFor(block, true).length >= 3)
      .map((block) => block.id)
    expect(asked).toEqual(eligible)
    const kept = lunaLow.rows.filter(
      (row) =>
        row.run === 1 && eligible.includes(row.blockId) && row.truthCheck.pass,
    )
    expect(stored.map((row) => row.sentence)).toEqual(
      kept.map((row) => row.sentence.trim()),
    )
  })
})
