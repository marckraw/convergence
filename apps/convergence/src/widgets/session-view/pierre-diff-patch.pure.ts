import {
  DEFAULT_DIFF_CONTEXT_LINES,
  foldUnifiedDiffContext,
  type FoldedDiffContext,
} from './diff-context.pure'
import {
  planPierreDiffPerformance,
  type PierreDiffPerformancePlan,
} from './pierre-diff-performance.pure'

/**
 * What the diff viewer draws from a file's diff (CONV-30): the patch Pierre
 * reads, folded to the context asked for, whether the context controls show,
 * and how heavy the diff is to draw. Derived once, by the container, so the
 * viewer itself is props in and markup out.
 */
export interface PierreDiffPatchView {
  /** The folded patch, or null when the diff has no hunks (a binary file). */
  patch: string | null
  /** What folding hid and what more can be shown; null with no patch. */
  folded: FoldedDiffContext | null
  /** The context is wider than the usual three lines, so Reset has work. */
  expandedFromDefault: boolean
  /** Some context is hidden, or some was shown: the controls have a job. */
  showContextControls: boolean
  performance: PierreDiffPerformancePlan
}

/**
 * A hunk-only diff as a whole patch Pierre reads: its file header added when
 * git's own isn't there. Null for a diff with no hunks.
 */
export function buildPierrePatch(input: {
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

/** The viewer's view of a file's diff at a context window (CONV-30). */
export function pierreDiffPatchView(input: {
  file: string | null
  diff: string
  contextBefore: number
  contextAfter: number
}): PierreDiffPatchView {
  const rawPatch = input.file
    ? buildPierrePatch({ file: input.file, diff: input.diff })
    : null
  const folded = rawPatch
    ? foldUnifiedDiffContext(rawPatch, {
        before: input.contextBefore,
        after: input.contextAfter,
      })
    : null
  const patch = folded?.patch ?? rawPatch
  const expandedFromDefault =
    input.contextBefore !== DEFAULT_DIFF_CONTEXT_LINES ||
    input.contextAfter !== DEFAULT_DIFF_CONTEXT_LINES
  return {
    patch,
    folded,
    expandedFromDefault,
    showContextControls:
      !!folded && (folded.totalHidden > 0 || expandedFromDefault),
    performance: planPierreDiffPerformance(patch ?? input.diff),
  }
}
