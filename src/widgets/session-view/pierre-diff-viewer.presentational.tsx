import { useMemo, type ReactNode } from 'react'
import {
  getFiletypeFromFileName,
  type DiffLineAnnotation,
  type SelectedLineRange,
  type SupportedLanguages,
} from '@pierre/diffs'
import {
  PatchDiff,
  Virtualizer,
  WorkerPoolContextProvider,
} from '@pierre/diffs/react'
import { Loader2 } from 'lucide-react'
import { planPierreDiffPerformance } from './pierre-diff-performance.pure'

interface PierreDiffViewerProps<TAnnotation = undefined> {
  file: string | null
  diff: string
  loading?: boolean
  emptyMessage?: string
  title?: string
  selectedLines?: SelectedLineRange | null
  lineAnnotations?: DiffLineAnnotation<TAnnotation>[]
  renderAnnotation?: (annotation: DiffLineAnnotation<TAnnotation>) => ReactNode
  onSelectedLinesChange?: (range: SelectedLineRange | null) => void
}

export const PierreDiffViewer = <TAnnotation,>({
  file,
  diff,
  loading = false,
  emptyMessage = 'Select a changed file to inspect its working tree diff.',
  title = 'Current workspace diff',
  selectedLines = null,
  lineAnnotations = [],
  renderAnnotation,
  onSelectedLinesChange,
}: PierreDiffViewerProps<TAnnotation>) => {
  const performancePlan = useMemo(() => planPierreDiffPerformance(diff), [diff])
  const patch = useMemo(
    () => (file ? buildPierrePatch({ file, diff }) : null),
    [diff, file],
  )
  const canUseWorkerPool =
    performancePlan.useWorkerPool && canUsePierreDiffWorkerPool()
  const workerPoolOptions = useMemo(
    () => ({
      poolSize: getPierreDiffWorkerPoolSize(),
      workerFactory: createPierreDiffWorker,
    }),
    [],
  )
  const workerHighlighterOptions = useMemo(
    () => ({
      langs: [getPierreDiffLanguageHint(file ?? '')],
      preferredHighlighter: 'shiki-js' as const,
    }),
    [file],
  )

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col" aria-busy="true">
        {renderDiffHeader({ file, title })}
        <div className="app-scrollbar min-h-0 flex-1 overflow-auto bg-background/60">
          <div className="flex h-full min-h-32 items-center justify-center gap-2 p-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Loading diff...</span>
          </div>
        </div>
      </div>
    )
  }

  const patchDiff = patch ? (
    <PatchDiff
      patch={patch}
      disableWorkerPool={!canUseWorkerPool}
      selectedLines={selectedLines}
      lineAnnotations={lineAnnotations}
      renderAnnotation={renderAnnotation}
      options={{
        disableFileHeader: true,
        enableLineSelection: !!onSelectedLinesChange,
        lineHoverHighlight: onSelectedLinesChange ? 'line' : 'disabled',
        onLineSelected: onSelectedLinesChange,
        onLineSelectionEnd: onSelectedLinesChange,
      }}
    />
  ) : null
  const diffNode =
    patchDiff && canUseWorkerPool ? (
      <WorkerPoolContextProvider
        poolOptions={workerPoolOptions}
        highlighterOptions={workerHighlighterOptions}
      >
        {patchDiff}
      </WorkerPoolContextProvider>
    ) : (
      patchDiff
    )
  const diffContent = patchDiff
    ? renderPierreDiffPerformanceShell({
        virtualize: performancePlan.virtualize,
        children: diffNode,
      })
    : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      {renderDiffHeader({ file, title })}
      <div className="app-scrollbar min-h-0 flex-1 overflow-auto bg-background/60">
        {diffContent ? (
          diffContent
        ) : (
          <div className="p-3 font-mono text-[11px] text-muted-foreground">
            {diff.trim() || '(no diff available)'}
          </div>
        )}
      </div>
    </div>
  )
}

export type { PierreDiffViewerProps }

function renderDiffHeader({ file, title }: { file: string; title: string }) {
  return (
    <div className="shrink-0 border-b border-border px-3 py-2">
      <p
        title={file}
        className="truncate font-mono text-[11px] text-foreground"
      >
        {file}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
    </div>
  )
}

function renderPierreDiffPerformanceShell({
  children,
  virtualize,
}: {
  children: ReactNode
  virtualize: boolean
}) {
  if (!virtualize) return children

  return (
    <Virtualizer
      className="h-full min-h-0"
      contentClassName="min-h-full"
      config={{ overscrollSize: 800, intersectionObserverMargin: 1200 }}
    >
      {children}
    </Virtualizer>
  )
}

function buildPierrePatch(input: {
  file: string
  diff: string
}): string | null {
  const diff = input.diff.trimEnd()
  if (!diff || !diff.includes('@@')) return null

  if (
    diff.startsWith('diff --git ') ||
    diff.startsWith('--- ') ||
    diff.includes('\n--- ')
  ) {
    return diff
  }

  return [
    `diff --git a/${input.file} b/${input.file}`,
    `--- a/${input.file}`,
    `+++ b/${input.file}`,
    diff,
  ].join('\n')
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

function getPierreDiffLanguageHint(file: string): SupportedLanguages {
  return getFiletypeFromFileName(file)
}
