import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import fixtures from '../../../tools/spikes/block-summary/fixtures.json'
import type { ConversationItem } from '../session/conversation-item.types'
import {
  acceptBlockSentence,
  assembleBlockPrompt,
  BLOCK_PROMPT_MAX_BYTES,
  BLOCK_RECORD_TEXT_MAX_CHARS,
  blockRecordsFromItems,
  buildBlockPrompt,
  deriveBlockTruth,
  type BlockRecord,
} from './block-sentence.pure'

const promptText = readFileSync(
  new URL('./block-sentence.prompt.txt', import.meta.url),
  'utf8',
)

function base(id: string, providerEventType: string | null = null) {
  return {
    id,
    sessionId: 's',
    sequence: 1,
    turnId: 't',
    state: 'complete' as const,
    createdAt: '2026-09-25T00:00:00.000Z',
    updatedAt: '2026-09-25T00:00:00.000Z',
    providerMeta: {
      providerId: 'codex',
      providerItemId: null,
      providerEventType,
    },
  }
}

describe('the prompt is the spike prompt (A3)', () => {
  it("keeps CV2b's prompt bytes", () => {
    expect(
      createHash('sha256')
        .update(
          readFileSync(new URL('./block-sentence.prompt.txt', import.meta.url)),
        )
        .digest('hex'),
    ).toBe('3021f53220e111d7a242f3cbec7f982581d941a15befc316d388da08503812c8')
  })

  it('assembles as run.mjs does: prompt, newline, then the JSON', () => {
    const records: BlockRecord[] = [
      { type: 'tool-call', toolName: 'Read', inputText: '{"path":"a.ts"}' },
    ]
    expect(assembleBlockPrompt(promptText, 'claude', records)).toBe(
      `${promptText}\n${JSON.stringify({ provider: 'claude', items: records })}`,
    )
  })
})

describe('the truth set is the spike truth set (A3)', () => {
  it('gives the 20 fixture blocks exactly the truth sets in fixtures.json', () => {
    expect(fixtures).toHaveLength(20)
    for (const block of fixtures) {
      const records = block.items as BlockRecord[]
      expect(deriveBlockTruth(records), block.id).toEqual(block.truth)
      expect(
        buildBlockPrompt(promptText, block.provider, records)?.truth,
        block.id,
      ).toEqual(block.truth)
    }
  })
})

describe('caps: the truth set follows what was sent (A3)', () => {
  it('cuts each record to 2,000 characters and forgets paths past the cut', () => {
    const inputText = `${'x'.repeat(BLOCK_RECORD_TEXT_MAX_CHARS)} src/secret/beyond.ts`
    const built = buildBlockPrompt(promptText, 'claude', [
      { type: 'tool-call', toolName: 'Bash', inputText },
    ])!
    const sent = built.records[0]!
    expect(sent.type === 'tool-call' && sent.inputText.length).toBe(
      BLOCK_RECORD_TEXT_MAX_CHARS,
    )
    expect(built.prompt).not.toContain('src/secret/beyond.ts')
    expect(built.truth.paths).not.toContain('src/secret/beyond.ts')
    expect(built.truth.paths).not.toContain('beyond.ts')
    expect(
      acceptBlockSentence('Ran a command on src/secret/beyond.ts', built.truth),
    ).toBeNull()
  })

  it('drops records from the end until the prompt fits 16 KB', () => {
    const records: BlockRecord[] = Array.from({ length: 12 }, (_, index) => ({
      type: 'tool-call',
      toolName: 'Read',
      inputText: JSON.stringify({
        file_path: `src/part-${index}/file-${index}.ts`,
        pad: 'y'.repeat(1_900),
      }),
    }))
    const built = buildBlockPrompt(promptText, 'claude', records)!
    expect(new TextEncoder().encode(built.prompt).length).toBeLessThanOrEqual(
      BLOCK_PROMPT_MAX_BYTES,
    )
    expect(built.records.length).toBeGreaterThan(0)
    expect(built.records.length).toBeLessThan(records.length)
    expect(built.records).toEqual(records.slice(0, built.records.length))
    const lastSent = built.records.length - 1
    expect(built.truth.paths).toContain(
      `src/part-${lastSent}/file-${lastSent}.ts`,
    )
    const firstDropped = built.records.length
    expect(built.truth.paths).not.toContain(
      `src/part-${firstDropped}/file-${firstDropped}.ts`,
    )
    expect(built.truth.paths).not.toContain(`file-${firstDropped}.ts`)
  })

  it('sends nothing when not even one record fits', () => {
    expect(
      buildBlockPrompt('p'.repeat(BLOCK_PROMPT_MAX_BYTES), 'claude', [
        { type: 'tool-call', toolName: 'Read', inputText: '{}' },
      ]),
    ).toBeNull()
    expect(buildBlockPrompt(promptText, 'claude', [])).toBeNull()
  })
})

describe('one mapper from real items to the spike records (A3)', () => {
  it('sends calls and Codex step results, never thinking or answered results', () => {
    const items: ConversationItem[] = [
      {
        ...base('call'),
        kind: 'tool-call',
        toolName: 'Read',
        inputText: '{"file_path":"src/a.ts"}',
      },
      {
        ...base('answer'),
        kind: 'tool-result',
        toolName: 'Read',
        relatedItemId: 'call',
        outputText: 'contents of src/other.ts',
      },
      { ...base('think'), kind: 'thinking', actor: 'assistant', text: 'hmm' },
      {
        ...base('pi-result'),
        kind: 'tool-result',
        toolName: 'read',
        relatedItemId: null,
        outputText: 'unlinked pi output',
      },
      {
        ...base('codex', 'commandExecution'),
        kind: 'tool-result',
        toolName: 'ls src/shared',
        relatedItemId: null,
        outputText: 'lib\nui',
      },
    ]
    expect(blockRecordsFromItems(items)).toEqual([
      {
        type: 'tool-call',
        toolName: 'Read',
        inputText: '{"file_path":"src/a.ts"}',
      },
      { type: 'tool-result', toolName: 'ls src/shared', outputText: 'lib\nui' },
    ])
  })
})

describe('truth before storage (R3)', () => {
  const truth = deriveBlockTruth([
    {
      type: 'tool-call',
      toolName: 'Read',
      inputText: '{"file_path":"src/widgets/session-view/state.ts"}',
    },
  ])

  it('keeps a supported sentence, trimmed', () => {
    expect(
      acceptBlockSentence('  Read src/widgets/session-view/state.ts.  ', truth),
    ).toBe('Read src/widgets/session-view/state.ts.')
  })

  it('drops an invented path, a long line and two sentences', () => {
    expect(acceptBlockSentence('Read src/auth/secrets.ts.', truth)).toBeNull()
    expect(
      acceptBlockSentence(Array(15).fill('word').join(' '), truth),
    ).toBeNull()
    expect(acceptBlockSentence('Read state.ts. Updated it.', truth)).toBeNull()
    expect(acceptBlockSentence('   ', truth)).toBeNull()
  })
})
