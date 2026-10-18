import { expect, it } from 'vitest'
import type { RemoteTaskOutputRefusalCode } from '@/shared/types/task-output.types'
import {
  TASK_OUTPUT_REFUSAL_WORDS,
  taskOutputSummary,
} from './task-output-tail.pure'

const CODES: RemoteTaskOutputRefusalCode[] = [
  'unsupported',
  'session-unknown',
  'task-unknown',
  'no-output',
  'read-refused',
  'rejected',
  'malformed',
]

it('says every refusal code in its own words — mutation reuse one sentence for two codes turns red', () => {
  expect(Object.keys(TASK_OUTPUT_REFUSAL_WORDS).sort()).toEqual(
    [...CODES].sort(),
  )
  const sentences = CODES.map((code) => TASK_OUTPUT_REFUSAL_WORDS[code])
  expect(new Set(sentences).size).toBe(CODES.length)
  for (const sentence of sentences) expect(sentence).toMatch(/\.$/)
})

it('summarises a window that starts mid-file differently from a whole file — mutation ignore truncated turns red', () => {
  const reading = {
    kind: 'output' as const,
    text: 'x\n',
    status: 'completed' as const,
    totalBytes: 2,
    readAt: '2026-10-18T10:00:00.000Z',
  }
  expect(taskOutputSummary({ ...reading, truncated: false })).toBe(
    'The whole output · completed',
  )
  expect(taskOutputSummary({ ...reading, truncated: true })).toBe(
    'The end of the output, up to 64 KiB · completed',
  )
})
