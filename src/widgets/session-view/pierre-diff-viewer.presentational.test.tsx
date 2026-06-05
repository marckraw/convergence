import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { DiffLineAnnotation, SelectedLineRange } from '@pierre/diffs'
import { buildLargePierreDiffFixture } from './pierre-diff-performance.pure'
import { PierreDiffViewer } from './pierre-diff-viewer.container'

const patchDiff = vi.hoisted(() => ({
  props: [] as Array<{
    patch: string
    lineAnnotations?: DiffLineAnnotation<{ label: string }>[]
    renderAnnotation?: (
      annotation: DiffLineAnnotation<{ label: string }>,
    ) => ReactNode
    disableWorkerPool?: boolean
    options?: {
      onLineSelected?: (range: SelectedLineRange | null) => void
    }
  }>,
  workerProviders: [] as Array<{
    poolOptions: { poolSize?: number; workerFactory: () => Worker }
    highlighterOptions: { langs?: string[]; preferredHighlighter?: string }
  }>,
}))

vi.mock('@pierre/diffs/react', () => ({
  PatchDiff: (props: {
    patch: string
    lineAnnotations?: DiffLineAnnotation<{ label: string }>[]
    renderAnnotation?: (
      annotation: DiffLineAnnotation<{ label: string }>,
    ) => ReactNode
    disableWorkerPool?: boolean
    options?: {
      onLineSelected?: (range: SelectedLineRange | null) => void
    }
  }) => {
    patchDiff.props.push(props)
    return (
      <button
        type="button"
        onClick={() =>
          props.options?.onLineSelected?.({
            start: 1,
            side: 'additions',
            end: 1,
            endSide: 'additions',
          })
        }
      >
        Pierre diff
      </button>
    )
  },
  Virtualizer: ({ children }: { children: ReactNode }) => (
    <div data-testid="pierre-virtualizer">{children}</div>
  ),
  WorkerPoolContextProvider: ({
    children,
    poolOptions,
    highlighterOptions,
  }: {
    children: ReactNode
    poolOptions: { poolSize?: number; workerFactory: () => Worker }
    highlighterOptions: { langs?: string[]; preferredHighlighter?: string }
  }) => {
    patchDiff.workerProviders.push({ poolOptions, highlighterOptions })
    return <div data-testid="pierre-worker-pool">{children}</div>
  },
}))

describe('PierreDiffViewer', () => {
  beforeEach(() => {
    patchDiff.props = []
    patchDiff.workerProviders = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders an empty state before a file is selected', () => {
    render(
      <PierreDiffViewer
        file={null}
        diff=""
        emptyMessage="Select a file first"
      />,
    )

    expect(screen.getByText('Select a file first')).toBeInTheDocument()
  })

  it('renders a loading state without mounting Pierre Diffs', () => {
    render(
      <PierreDiffViewer
        file="src/app.ts"
        diff=""
        loading
        title="Current workspace diff"
      />,
    )

    expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    expect(screen.getByText('Current workspace diff')).toBeInTheDocument()
    expect(screen.getByText('Loading diff...')).toBeInTheDocument()
    expect(patchDiff.props).toHaveLength(0)
  })

  it('keeps rendering an existing diff while a replacement is loading', () => {
    render(
      <PierreDiffViewer
        file="src/app.ts"
        diff={'@@ -1 +1 @@\n-old\n+new'}
        loading
      />,
    )

    expect(screen.queryByText('Loading diff...')).toBeNull()
    expect(screen.getByText('Pierre diff')).toBeInTheDocument()
    expect(patchDiff.props.at(-1)?.patch).toContain('+new')
  })

  it('wraps hunk-only diffs with file headers for Pierre', () => {
    render(
      <PierreDiffViewer file="src/app.ts" diff={'@@ -1 +1 @@\n-old\n+new'} />,
    )

    expect(screen.getByText('Pierre diff')).toBeInTheDocument()
    expect(patchDiff.props.at(-1)?.patch).toBe(
      [
        'diff --git a/src/app.ts b/src/app.ts',
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@ -1 +1 @@\n-old\n+new',
      ].join('\n'),
    )
  })

  it('hides the built-in file header when showFileHeader is false', () => {
    render(
      <PierreDiffViewer
        file="src/app.ts"
        diff={'@@ -1 +1 @@\n-old\n+new'}
        subtitle="Defines the daemon contract."
        showFileHeader={false}
      />,
    )

    expect(screen.getByText('Pierre diff')).toBeInTheDocument()
    expect(screen.queryByText('Defines the daemon contract.')).toBeNull()
    expect(screen.queryByText('src/app.ts')).toBeNull()
  })

  it('folds rich context by default and expands it from header controls', () => {
    render(
      <PierreDiffViewer
        file="src/app.ts"
        diff={[
          '@@ -1,10 +1,10 @@',
          ' one',
          ' two',
          ' three',
          ' four',
          '-old',
          '+new',
          ' six',
          ' seven',
          ' eight',
          ' nine',
        ].join('\n')}
      />,
    )

    expect(patchDiff.props.at(-1)?.patch).not.toContain(' one')
    expect(patchDiff.props.at(-1)?.patch).not.toContain(' nine')

    fireEvent.click(screen.getByLabelText('Show more context above changes'))
    expect(patchDiff.props.at(-1)?.patch).toContain(' one')
    expect(patchDiff.props.at(-1)?.patch).not.toContain(' nine')

    fireEvent.click(screen.getByLabelText('Show more context below changes'))
    expect(patchDiff.props.at(-1)?.patch).toContain(' nine')

    fireEvent.click(screen.getByLabelText('Reset visible diff context'))
    expect(patchDiff.props.at(-1)?.patch).not.toContain(' one')
    expect(patchDiff.props.at(-1)?.patch).not.toContain(' nine')
  })

  it('forwards Pierre line selections', () => {
    const onSelectedLinesChange = vi.fn()

    render(
      <PierreDiffViewer
        file="src/app.ts"
        diff={'@@ -1 +1 @@\n-old\n+new'}
        onSelectedLinesChange={onSelectedLinesChange}
      />,
    )

    fireEvent.click(screen.getByText('Pierre diff'))

    expect(onSelectedLinesChange).toHaveBeenCalledWith({
      start: 1,
      side: 'additions',
      end: 1,
      endSide: 'additions',
    })
  })

  it('forwards Pierre line annotations and renderer', () => {
    const annotations: DiffLineAnnotation<{ label: string }>[] = [
      {
        side: 'additions',
        lineNumber: 1,
        metadata: { label: 'Review note' },
      },
    ]
    const renderAnnotation = vi.fn((annotation) => (
      <div>{annotation.metadata.label}</div>
    ))

    render(
      <PierreDiffViewer
        file="src/app.ts"
        diff={'@@ -1 +1 @@\n-old\n+new'}
        lineAnnotations={annotations}
        renderAnnotation={renderAnnotation}
      />,
    )

    expect(patchDiff.props.at(-1)?.lineAnnotations).toBe(annotations)
    expect(patchDiff.props.at(-1)?.renderAnnotation).toBe(renderAnnotation)
  })

  it('renders no-diff text without mounting Pierre Diffs', () => {
    render(<PierreDiffViewer file="src/app.ts" diff="(no diff available)" />)

    expect(screen.getByText('(no diff available)')).toBeInTheDocument()
  })

  it('wraps large diffs in Pierre Virtualizer', () => {
    render(
      <PierreDiffViewer
        file="src/generated.ts"
        diff={buildLargePierreDiffFixture(300)}
      />,
    )

    expect(screen.getByTestId('pierre-virtualizer')).toBeInTheDocument()
    expect(patchDiff.props.at(-1)?.disableWorkerPool).toBe(true)
  })

  it('enables worker-pool highlighting for very large diffs when workers exist', () => {
    vi.stubGlobal('Worker', vi.fn())

    render(
      <PierreDiffViewer
        file="src/generated.ts"
        diff={buildLargePierreDiffFixture(900)}
      />,
    )

    expect(screen.getByTestId('pierre-worker-pool')).toBeInTheDocument()
    expect(patchDiff.props.at(-1)?.disableWorkerPool).toBe(false)
    expect(patchDiff.workerProviders.at(-1)?.highlighterOptions).toMatchObject({
      langs: ['typescript'],
      preferredHighlighter: 'shiki-js',
    })
  })

  it.each([
    ['scripts/tool.py', 'python'],
    ['cmd/main.go', 'go'],
    ['src/lib.rs', 'rust'],
    ['src/styles.css', 'css'],
    ['docs/readme.md', 'markdown'],
    ['data/config.json', 'json'],
  ])('preloads the Pierre language hint for %s', (file, language) => {
    vi.stubGlobal('Worker', vi.fn())

    render(
      <PierreDiffViewer file={file} diff={buildLargePierreDiffFixture(900)} />,
    )

    expect(patchDiff.workerProviders.at(-1)?.highlighterOptions).toMatchObject({
      langs: [language],
      preferredHighlighter: 'shiki-js',
    })
  })

  it('clamps Pierre worker pool size to a bounded range', () => {
    const originalHardwareConcurrency = window.navigator.hardwareConcurrency
    Object.defineProperty(window.navigator, 'hardwareConcurrency', {
      configurable: true,
      value: 16,
    })
    vi.stubGlobal('Worker', vi.fn())

    render(
      <PierreDiffViewer
        file="src/generated.ts"
        diff={buildLargePierreDiffFixture(900)}
      />,
    )

    expect(patchDiff.workerProviders.at(-1)?.poolOptions.poolSize).toBe(4)

    Object.defineProperty(window.navigator, 'hardwareConcurrency', {
      configurable: true,
      value: 1,
    })

    render(
      <PierreDiffViewer
        file="src/generated.ts"
        diff={buildLargePierreDiffFixture(900)}
      />,
    )

    expect(patchDiff.workerProviders.at(-1)?.poolOptions.poolSize).toBe(1)

    Object.defineProperty(window.navigator, 'hardwareConcurrency', {
      configurable: true,
      value: originalHardwareConcurrency,
    })
  })
})
