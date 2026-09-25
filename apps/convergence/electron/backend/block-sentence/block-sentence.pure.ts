/**
 * The model sentence for a closed work block (MAR-3395 CV3): what is sent,
 * what the sentence may name, and the gate it must pass before it is kept.
 *
 * One module, two users: the app's block-sentence service and the CV2 spike
 * harness under `tools/spikes/block-summary/` (which loads this file through
 * Node's type stripping, so it imports nothing at runtime).
 */
import type { WorkBlockItem } from '../../../src/entities/session/work-blocks.pure'

/** CV2b's candidate, frozen by Marcin 2026-09-25: GPT-6 Luna at low effort. */
export const LUNA_MODEL_ID = 'gpt-6-luna'
export const BLOCK_SENTENCE_EFFORT = 'low' as const

/**
 * Whole-call budget for one helper turn.
 *
 * The app's own default is 20s. That budget cannot cover a cold `codex
 * app-server` start (the host allows 90s) plus a cloud answer, and the harness
 * already abandons a row at 120s. 110s lets the worker report the timeout
 * itself instead of the parent killing a silent process.
 */
export const LUNA_ONE_SHOT_TIMEOUT_MS = 110_000

/** A block is described only when it folds at least this many entries (R2). */
export const BLOCK_SENTENCE_MIN_MEMBERS = 3
/** At most this many requests per finished turn; the rest keep facts (R2). */
export const BLOCK_SENTENCE_MAX_PER_TURN = 20
/** Each record's text is cut to this many characters (A3). */
export const BLOCK_RECORD_TEXT_MAX_CHARS = 2_000
/** The whole prompt stays within this many UTF-8 bytes (A3). */
export const BLOCK_PROMPT_MAX_BYTES = 16 * 1024

/** The spike's record shape (`fixtures.json`): what the model reads. */
export type BlockRecord =
  | { type: 'tool-call'; toolName: string; inputText: string }
  | { type: 'tool-result'; toolName: string; outputText: string }

export type BlockTruth = { paths: string[]; toolNames: string[] }
export type TruthBlock = { truth: BlockTruth }

/**
 * Codex writes no tool calls: each step arrives as a result typed by its
 * event. These are the fold rule's own step events (`workSteps`), so the
 * sentence reads exactly the steps the block's facts count.
 */
const STANDALONE_RESULT_EVENTS = new Set([
  'commandExecution',
  'fileChange',
  'mcpToolCall',
])

/**
 * A block's members as the spike's records (A3). A call is a record; a result
 * is a record only when it answers no call and is one of the step events
 * above (Codex). Thinking, and results that answer a call, are not sent: the
 * spike measured calls for Claude, Pi and Cursor and results for Codex only.
 */
export function blockRecordsFromItems(
  items: readonly WorkBlockItem[],
): BlockRecord[] {
  const records: BlockRecord[] = []
  for (const item of items) {
    if (item.kind === 'tool-call') {
      records.push({
        type: 'tool-call',
        toolName: item.toolName,
        inputText: item.inputText,
      })
      continue
    }
    if (
      item.kind === 'tool-result' &&
      item.relatedItemId === null &&
      STANDALONE_RESULT_EVENTS.has(item.providerMeta.providerEventType ?? '')
    ) {
      records.push({
        type: 'tool-result',
        toolName: item.toolName ?? '',
        outputText: item.outputText,
      })
    }
  }
  return records
}

const TRUTH_PATH_PATTERN =
  /(?:[\w.-]+\/)+[\w.-]+|\b[\w-]+\.(?:json|tsx?|css|md)\b/g

/** A directory-listing command: its output lines are names the block saw. */
const LISTING_COMMAND = /^ls(?:\s|$)/

/**
 * What a sentence may name, from exactly the records sent (A3): each literal
 * path, its parents and its basename, the literal entries a listing printed,
 * and the tool names. The spike's generator derives `fixtures.json` with this
 * same function.
 */
export function deriveBlockTruth(records: readonly BlockRecord[]): BlockTruth {
  const paths = new Set<string>()
  for (const record of records) {
    const text = Object.values(record).join(' ')
    for (const match of text.matchAll(TRUTH_PATH_PATTERN)) {
      const path = match[0]
      paths.add(path)
      paths.add(path.split('/').at(-1)!)
      let parent = path
      while (parent.includes('/')) {
        parent = parent.slice(0, parent.lastIndexOf('/'))
        paths.add(parent)
      }
    }
    if (
      record.type === 'tool-result' &&
      LISTING_COMMAND.test(record.toolName)
    ) {
      for (const line of record.outputText.split('\n')) {
        const entry = line.trim()
        if (entry && !/\s/.test(entry)) paths.add(entry)
      }
    }
  }
  return {
    toolNames: [...new Set(records.map((record) => record.toolName))],
    paths: [...paths].sort(),
  }
}

function capText(text: string): string {
  return text.length > BLOCK_RECORD_TEXT_MAX_CHARS
    ? text.slice(0, BLOCK_RECORD_TEXT_MAX_CHARS)
    : text
}

function capRecord(record: BlockRecord): BlockRecord {
  return record.type === 'tool-call'
    ? { ...record, inputText: capText(record.inputText) }
    : { ...record, outputText: capText(record.outputText) }
}

/** The spike's assembly (`run.mjs`): the prompt text, `\n`, then the JSON. */
export function assembleBlockPrompt(
  promptText: string,
  provider: string,
  records: readonly BlockRecord[],
): string {
  return `${promptText}\n${JSON.stringify({ provider, items: records })}`
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length
}

export interface BlockPrompt {
  prompt: string
  /** Exactly the records inside `prompt`, after both caps. */
  records: BlockRecord[]
  /** Derived from `records`, never from what was cut or dropped. */
  truth: BlockTruth
}

/**
 * The request for one block (A3). Each record's text is cut to 2,000
 * characters; records are then dropped from the end until the whole prompt
 * fits in 16 KB. The truth set follows what was sent. Null when nothing fits.
 */
export function buildBlockPrompt(
  promptText: string,
  provider: string,
  records: readonly BlockRecord[],
): BlockPrompt | null {
  const capped = records.map(capRecord)
  while (capped.length > 0) {
    const prompt = assembleBlockPrompt(promptText, provider, capped)
    if (utf8Bytes(prompt) <= BLOCK_PROMPT_MAX_BYTES)
      return { prompt, records: capped, truth: deriveBlockTruth(capped) }
    capped.pop()
  }
  return null
}

/**
 * CV2's lexical gate (MAR-3392), moved here unchanged: no path outside the
 * block's truth set, at most 14 words, one sentence. It is not a proof of
 * semantic truth; a passing sentence can still overclaim an outcome.
 */
export function truthCheck(sentence: string, block: TruthBlock) {
  const reasons: string[] = []
  const text = sentence.trim()
  if (!text) reasons.push('empty')
  const wordCount = text ? text.split(/\s+/u).length : 0
  if (wordCount > 14) reasons.push('over-14-words')

  // Mask dotted paths before counting sentence punctuation.
  const pathPattern =
    /(?:\.?\.?\/)?(?:[\w@.-]+\/)+[\w@.-]+|\b[\w-]+(?:\.[\w-]+)+/gu
  const normalize = (path: string) =>
    path.replace(/[.!?]+$/u, '').replace(/\/$/u, '')
  const pathMentions = [...text.matchAll(pathPattern)].map((match) =>
    normalize(match[0]),
  )
  const masked = text.replace(
    pathPattern,
    (match) => `PATH${match.match(/[.!?]+$/u)?.[0] ?? ''}`,
  )
  const sentences = masked
    .split(/[.!?]+(?:\s+|$)/u)
    .filter((part) => part.trim())
  if (sentences.length > 1 || /[\r\n]/u.test(text))
    reasons.push('multiple-sentences')

  // Also catch explicit extensionless references: "folder banana" / "banana directory".
  for (const match of text.matchAll(
    /\b(?:file|folder|directory)\s+(?:named|called)\s+[`"']?([\w./-]+)/giu,
  ))
    pathMentions.push(normalize(match[1]))
  for (const match of text.matchAll(
    /\b(?:file|folder|directory)\s+[`"']?([\w./-]+)|[`"']?([\w./-]+)[`"']?\s+(?:file|folder|directory)\b/giu,
  )) {
    const mention = normalize(match[1] ?? match[2])
    if (
      ![
        'the',
        'a',
        'this',
        'that',
        'in',
        'under',
        'named',
        'called',
        'working',
        'current',
        'at',
        'paths',
      ].includes(mention.toLowerCase())
    )
      pathMentions.push(mention)
  }
  const unknownPaths = [
    ...new Set(
      pathMentions.filter((path) => !block.truth.paths.includes(path)),
    ),
  ]
  if (unknownPaths.length) reasons.push('invented-path')
  return { pass: reasons.length === 0, reasons, wordCount, unknownPaths }
}

/**
 * The sentence as stored: trimmed, and kept only if it passes the gate (R3).
 * A failing sentence is dropped -- never retried, never repaired.
 */
export function acceptBlockSentence(
  sentence: string,
  truth: BlockTruth,
): string | null {
  const text = sentence.trim()
  return truthCheck(text, { truth }).pass ? text : null
}

/**
 * The helper turn for one block (A1): GPT-6 Luna at low effort on the ambient
 * default Codex account (`null` is a statement, never an omission), with the
 * spike's read-only, no-approval profile and its 110s budget.
 */
export function buildBlockSentenceOneShotInput(input: {
  prompt: string
  workingDirectory: string
  requestId: string
}) {
  return {
    prompt: input.prompt,
    modelId: LUNA_MODEL_ID,
    effort: BLOCK_SENTENCE_EFFORT,
    workingDirectory: input.workingDirectory,
    timeoutMs: LUNA_ONE_SHOT_TIMEOUT_MS,
    requestId: input.requestId,
    providerAccountId: null,
    permissionConfig: {
      preset: 'custom' as const,
      codex: {
        approvalPolicy: 'never' as const,
        sandbox: 'read-only' as const,
      },
    },
  }
}
