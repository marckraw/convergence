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
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/shared/ui/button'
import {
  DEFAULT_DIFF_CONTEXT_LINES,
  foldUnifiedDiffContext,
} from './diff-context.pure'
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
  contextBefore?: number
  contextAfter?: number
  onExpandContextBefore?: () => void
  onExpandContextAfter?: () => void
  onExpandContextBoth?: () => void
  onResetContext?: () => void
}

export const PierreDiffViewerView = <TAnnotation,>({
  file,
  diff,
  loading = false,
  emptyMessage = 'Select a changed file to inspect its working tree diff.',
  title = 'Current workspace diff',
  selectedLines = null,
  lineAnnotations = [],
  renderAnnotation,
  onSelectedLinesChange,
  contextBefore = DEFAULT_DIFF_CONTEXT_LINES,
  contextAfter = DEFAULT_DIFF_CONTEXT_LINES,
  onExpandContextBefore,
  onExpandContextAfter,
  onExpandContextBoth,
  onResetContext,
}: PierreDiffViewerProps<TAnnotation>) => {
  const rawPatch = useMemo(
    () => (file ? buildPierrePatch({ file, diff }) : null),
    [diff, file],
  )
  const foldedContext = useMemo(
    () =>
      rawPatch
        ? foldUnifiedDiffContext(rawPatch, {
            before: contextBefore,
            after: contextAfter,
          })
        : null,
    [contextAfter, contextBefore, rawPatch],
  )
  const patch = foldedContext?.patch ?? rawPatch
  const expandedFromDefault =
    contextBefore !== DEFAULT_DIFF_CONTEXT_LINES ||
    contextAfter !== DEFAULT_DIFF_CONTEXT_LINES
  const shouldShowContextControls =
    !!foldedContext && (foldedContext.totalHidden > 0 || expandedFromDefault)
  const performancePlan = useMemo(
    () => planPierreDiffPerformance(patch ?? diff),
    [diff, patch],
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

  if (loading && !diff) {
    return (
      <div className="flex h-full min-h-0 flex-col" aria-busy="true">
        {renderDiffHeader({ file, title, loading })}
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
  const fallbackDiffContent = (
    <div className="p-3 font-mono text-[11px] text-muted-foreground">
      {diff.trim() || '(no diff available)'}
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy={loading}>
      {renderDiffHeader({
        file,
        title,
        loading,
        contextControls: shouldShowContextControls
          ? renderDiffContextControls({
              canExpandBefore: foldedContext?.canExpandBefore ?? false,
              canExpandAfter: foldedContext?.canExpandAfter ?? false,
              expandedFromDefault,
              onExpandBefore: onExpandContextBefore,
              onExpandAfter: onExpandContextAfter,
              onExpandBoth: onExpandContextBoth,
              onReset: onResetContext,
            })
          : null,
      })}
      {performancePlan.virtualize && diffContent ? (
        diffContent
      ) : (
        <div className="app-scrollbar min-h-0 flex-1 overflow-auto bg-background/60">
          {diffContent ?? fallbackDiffContent}
        </div>
      )}
    </div>
  )
}

export type { PierreDiffViewerProps }

function renderDiffHeader({
  file,
  title,
  loading = false,
  contextControls = null,
}: {
  file: string
  title: string
  loading?: boolean
  contextControls?: ReactNode
}) {
  return (
    <div className="shrink-0 border-b border-border px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <p
          title={file}
          className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground"
        >
          {file}
        </p>
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : null}
        {contextControls}
      </div>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
    </div>
  )
}

function renderDiffContextControls(input: {
  canExpandBefore: boolean
  canExpandAfter: boolean
  expandedFromDefault: boolean
  onExpandBefore?: () => void
  onExpandAfter?: () => void
  onExpandBoth?: () => void
  onReset?: () => void
}) {
  return (
    <div
      className="ml-auto flex shrink-0 items-center gap-1"
      aria-label="Diff context controls"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Show more context above changes"
        title="Show more context above changes"
        disabled={!input.canExpandBefore || !input.onExpandBefore}
        onClick={input.onExpandBefore}
        className={diffContextButtonClassName(input.canExpandBefore)}
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Show more context above and below changes"
        title="Show more context above and below changes"
        disabled={
          (!input.canExpandBefore && !input.canExpandAfter) ||
          !input.onExpandBoth
        }
        onClick={input.onExpandBoth}
        className={diffContextButtonClassName(
          input.canExpandBefore || input.canExpandAfter,
        )}
      >
        <ChevronsUpDown className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Show more context below changes"
        title="Show more context below changes"
        disabled={!input.canExpandAfter || !input.onExpandAfter}
        onClick={input.onExpandAfter}
        className={diffContextButtonClassName(input.canExpandAfter)}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Reset visible diff context"
        title="Reset visible diff context"
        disabled={!input.expandedFromDefault || !input.onReset}
        onClick={input.onReset}
        className={diffContextButtonClassName(input.expandedFromDefault)}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function diffContextButtonClassName(enabled: boolean): string {
  return [
    'h-6 w-6 rounded border border-border text-muted-foreground',
    enabled
      ? 'hover:bg-muted hover:text-foreground'
      : 'cursor-not-allowed opacity-40',
  ].join(' ')
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
      className="app-scrollbar h-full min-h-0 overflow-auto bg-background/60"
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
