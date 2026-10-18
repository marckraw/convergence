import type { FC } from 'react'
import { Button, CodeBlock, FormError, Timestamp } from '@convergence/ui'
import {
  TASK_OUTPUT_REFUSAL_WORDS,
  taskOutputSummary,
  type TaskOutputTailView,
} from './task-output-tail.pure'

interface Props {
  view: TaskOutputTailView
  onRead: () => void
}

/**
 * A remote task's output tail in the parallel-work panel (MAR-4275): a button
 * that asks the host for the end of the task's output, and then the host's
 * redacted lines, or its refusal in words. Offered only for a task on a host
 * that advertises `tasks.output.v1`.
 */
export const TaskOutputTail: FC<Props> = ({ view, onRead }) => (
  <div className="space-y-2" data-testid="task-output-tail">
    <div className="flex items-center justify-between gap-2">
      <h4 className="text-xs font-medium text-ink-muted">Output tail</h4>
      <Button
        variant="secondary"
        size="sm"
        disabled={view.kind === 'loading'}
        onClick={onRead}
      >
        {view.kind === 'loading'
          ? 'Reading…'
          : view.kind === 'idle'
            ? 'Read output tail'
            : 'Read again'}
      </Button>
    </div>
    {view.kind === 'idle' && (
      <p className="text-xs text-ink-muted">
        The output file is on the host. Reading asks the host for the end of it.
      </p>
    )}
    {view.kind === 'output' && (
      <>
        <p className="text-xs text-ink-muted">
          {taskOutputSummary(view.reading)} · read{' '}
          <Timestamp date={view.reading.readAt} format="log" />
        </p>
        {view.reading.text.length > 0 ? (
          <CodeBlock label="Task output tail" wrap copyable>
            {view.reading.text}
          </CodeBlock>
        ) : (
          <p className="text-xs text-ink-muted">No complete line yet</p>
        )}
      </>
    )}
    {view.kind === 'refused' && (
      <p className="text-xs text-ink-muted" role="status">
        {TASK_OUTPUT_REFUSAL_WORDS[view.code]}
      </p>
    )}
    {view.kind === 'failed' && (
      <FormError>Couldn’t read the output: {view.message}</FormError>
    )}
  </div>
)
