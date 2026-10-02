import { useMemo, useState } from 'react'
import { getFiletypeFromFileName } from '@pierre/diffs'
import {
  DEFAULT_DIFF_CONTEXT_LINES,
  DIFF_CONTEXT_EXPANSION_STEP,
  MAX_DIFF_CONTEXT_LINES,
} from './diff-context.pure'
import { pierreDiffPatchView } from './pierre-diff-patch.pure'
import {
  PierreDiffViewerView,
  type PierreDiffViewerProps,
  type PierreDiffWorkerPool,
} from './pierre-diff-viewer.presentational'

interface DiffContextState {
  key: string
  before: number
  after: number
}

/**
 * The diff viewer's state and derivations (CONV-30): the context window it
 * has widened to, the patch folded to it and planned, and the worker pool a
 * heavy diff is highlighted in. Each is memoised here, because folding a big
 * diff is real work and the pool's options must keep their identity; the
 * view only draws.
 */
export const PierreDiffViewer = <TAnnotation,>({
  file,
  diff,
  // The window is this container's own state; a caller's is not read.
  contextBefore: _contextBefore,
  contextAfter: _contextAfter,
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
  const view = useMemo(
    () =>
      pierreDiffPatchView({
        file,
        diff,
        contextBefore: activeContext.before,
        contextAfter: activeContext.after,
      }),
    [activeContext.after, activeContext.before, diff, file],
  )
  const poolOptions = useMemo(
    () => ({
      poolSize: getPierreDiffWorkerPoolSize(),
      workerFactory: createPierreDiffWorker,
    }),
    [],
  )
  const highlighterOptions = useMemo(
    () => ({
      langs: [getFiletypeFromFileName(file ?? '')],
      preferredHighlighter: 'shiki-js' as const,
    }),
    [file],
  )
  const workerPool = useMemo<PierreDiffWorkerPool | null>(
    () =>
      view.performance.useWorkerPool && canUsePierreDiffWorkerPool()
        ? { poolOptions, highlighterOptions }
        : null,
    [highlighterOptions, poolOptions, view.performance.useWorkerPool],
  )

  return (
    <PierreDiffViewerView
      {...props}
      file={file}
      diff={diff}
      view={view}
      workerPool={workerPool}
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

function canUsePierreDiffWorkerPool(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined'
}

function createPierreDiffWorker(): Worker {
  return new Worker(
    new URL('@pierre/diffs/worker/worker.js', import.meta.url),
    {
      name: 'pierre-diffs',
      type: 'module',
    },
  )
}

function getPierreDiffWorkerPoolSize(): number {
  if (typeof window === 'undefined') return 1
  const cores = window.navigator.hardwareConcurrency || 2
  return Math.max(1, Math.min(4, cores - 1))
}
