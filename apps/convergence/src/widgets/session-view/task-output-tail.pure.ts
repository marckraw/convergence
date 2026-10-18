import type {
  RemoteTaskOutputReading,
  RemoteTaskOutputRefusalCode,
} from '@/shared/types/task-output.types'

/** What the output-tail section shows: nothing read yet, a read under way, its answer, or why not. */
export type TaskOutputTailView =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | {
      kind: 'output'
      reading: Extract<RemoteTaskOutputReading, { kind: 'output' }>
    }
  | { kind: 'refused'; code: RemoteTaskOutputRefusalCode }
  | { kind: 'failed'; message: string }

/**
 * Each refusal code a host can give for a task's output (`tasks.output.v1`,
 * MAR-4275), in words. These are Convergence's sentences, never the host's
 * own text, which a refusal is not trusted to keep free of paths.
 */
export const TASK_OUTPUT_REFUSAL_WORDS = {
  unsupported: 'This host does not serve a task’s output.',
  'session-unknown': 'The host no longer has this session.',
  'task-unknown': 'The host has no record of this task.',
  'no-output': 'This task has no output: it never had a file, or it is gone.',
  'read-refused':
    'The host’s policy does not allow reading this task’s output.',
  rejected: 'The host did not accept the request for this task’s output.',
  malformed: 'The host answered with something that is not this task’s output.',
} as const satisfies Record<RemoteTaskOutputRefusalCode, string>

/** Reads a task's status as the section's one-line summary says it. */
export function taskOutputSummary(
  reading: Extract<RemoteTaskOutputReading, { kind: 'output' }>,
): string {
  const covered = reading.truncated
    ? 'The end of the output, up to 64 KiB'
    : 'The whole output'
  return `${covered} · ${reading.status}`
}
