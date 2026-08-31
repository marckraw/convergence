import { useState } from 'react'
import {
  DEFAULT_DIFF_CONTEXT_LINES,
  DIFF_CONTEXT_EXPANSION_STEP,
  MAX_DIFF_CONTEXT_LINES,
} from './diff-context.pure'
import {
  PierreDiffViewerView,
  type PierreDiffViewerProps,
} from './pierre-diff-viewer.presentational'

interface DiffContextState {
  key: string
  before: number
  after: number
}

export const PierreDiffViewer = <TAnnotation,>({
  file,
  diff,
  ...props
}: PierreDiffViewerProps<TAnnotation>) => {
  const diffContextKey = `${file ?? ''}\0${diff}`
  const [contextState, setContextState] = useState<DiffContextState>({
    key: '',
    before: DEFAULT_DIFF_CONTEXT_LINES,
    after: DEFAULT_DIFF_CONTEXT_LINES,
  })
  const activeContext =
    contextState.key === diffContextKey
      ? contextState
      : {
          key: diffContextKey,
          before: DEFAULT_DIFF_CONTEXT_LINES,
          after: DEFAULT_DIFF_CONTEXT_LINES,
        }

  return (
    <PierreDiffViewerView
      {...props}
      file={file}
      diff={diff}
      contextBefore={activeContext.before}
      contextAfter={activeContext.after}
      onExpandContextBefore={() => {
        setContextState((current) =>
          expandContextWindow({
            current,
            key: diffContextKey,
            direction: 'before',
          }),
        )
      }}
      onExpandContextAfter={() => {
        setContextState((current) =>
          expandContextWindow({
            current,
            key: diffContextKey,
            direction: 'after',
          }),
        )
      }}
      onExpandContextBoth={() => {
        setContextState((current) =>
          expandContextWindow({
            current,
            key: diffContextKey,
            direction: 'both',
          }),
        )
      }}
      onResetContext={() => {
        setContextState({
          key: diffContextKey,
          before: DEFAULT_DIFF_CONTEXT_LINES,
          after: DEFAULT_DIFF_CONTEXT_LINES,
        })
      }}
    />
  )
}

function expandContextWindow(input: {
  current: DiffContextState
  key: string
  direction: 'before' | 'after' | 'both'
}): DiffContextState {
  const current =
    input.current.key === input.key
      ? input.current
      : {
          key: input.key,
          before: DEFAULT_DIFF_CONTEXT_LINES,
          after: DEFAULT_DIFF_CONTEXT_LINES,
        }

  return {
    key: input.key,
    before:
      input.direction === 'before' || input.direction === 'both'
        ? clampExpandedContext(current.before)
        : current.before,
    after:
      input.direction === 'after' || input.direction === 'both'
        ? clampExpandedContext(current.after)
        : current.after,
  }
}

function clampExpandedContext(current: number): number {
  return Math.min(MAX_DIFF_CONTEXT_LINES, current + DIFF_CONTEXT_EXPANSION_STEP)
}
