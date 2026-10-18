import { useCallback, useEffect, useRef, useState } from 'react'
import { parallelWorkRefusal } from './parallel-work.pure'
import { parallelWorkApi } from './parallel-work.api'
import type { TaskOutputTailView } from './task-output-tail.pure'

/**
 * One remote task's output tail (MAR-4275), read when asked and again when
 * asked again. The view starts `idle`: nothing is fetched until the person
 * presses the button, since the read goes to another machine. An answer that
 * lands after the task, or the panel, has changed is dropped.
 */
export function useTaskOutputTail(sessionId: string, taskId: string) {
  const [view, setView] = useState<TaskOutputTailView>({ kind: 'idle' })
  const current = useRef({ sessionId, taskId })
  useEffect(() => {
    current.current = { sessionId, taskId }
    setView({ kind: 'idle' })
  }, [sessionId, taskId])
  const read = useCallback(async () => {
    const asked = { sessionId, taskId }
    const stillAsked = () =>
      current.current.sessionId === asked.sessionId &&
      current.current.taskId === asked.taskId
    setView({ kind: 'loading' })
    try {
      const reading = await parallelWorkApi.readTaskOutput(sessionId, taskId)
      if (stillAsked())
        setView(
          reading.kind === 'output'
            ? { kind: 'output', reading }
            : { kind: 'refused', code: reading.code },
        )
    } catch (failure) {
      if (stillAsked())
        setView({ kind: 'failed', message: parallelWorkRefusal(failure) })
    }
  }, [sessionId, taskId])
  return { view, read }
}
