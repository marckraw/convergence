import type { FC } from 'react'
import { TaskOutputTail } from './task-output-tail.presentational'
import { useTaskOutputTail } from './use-task-output-tail'

interface Props {
  sessionId: string
  taskId: string
}

/** Wires one task's output-tail read to its section (MAR-4275). */
export const TaskOutputTailSection: FC<Props> = ({ sessionId, taskId }) => {
  const { view, read } = useTaskOutputTail(sessionId, taskId)
  return <TaskOutputTail view={view} onRead={() => void read()} />
}
