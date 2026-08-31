import { describe, expect, it } from 'vitest'
import {
  PIERRE_DIFF_VIRTUALIZATION_LINE_THRESHOLD,
  PIERRE_DIFF_WORKER_POOL_LINE_THRESHOLD,
  buildLargePierreDiffFixture,
  planPierreDiffPerformance,
} from './pierre-diff-performance.pure'

describe('Pierre diff performance helpers', () => {
  it('keeps small diffs on the simple render path', () => {
    expect(planPierreDiffPerformance('@@ -1 +1 @@\n-old\n+new')).toEqual({
      lineCount: 3,
      virtualize: false,
      useWorkerPool: false,
    })
  })

  it('virtualizes large diffs before enabling worker highlighting', () => {
    const diff = buildLargePierreDiffFixture(
      PIERRE_DIFF_VIRTUALIZATION_LINE_THRESHOLD,
    )

    expect(planPierreDiffPerformance(diff)).toEqual({
      lineCount: PIERRE_DIFF_VIRTUALIZATION_LINE_THRESHOLD,
      virtualize: true,
      useWorkerPool: false,
    })
  })

  it('uses worker-pool highlighting for very large diffs', () => {
    const diff = buildLargePierreDiffFixture(
      PIERRE_DIFF_WORKER_POOL_LINE_THRESHOLD,
    )

    expect(planPierreDiffPerformance(diff)).toEqual({
      lineCount: PIERRE_DIFF_WORKER_POOL_LINE_THRESHOLD,
      virtualize: true,
      useWorkerPool: true,
    })
  })
})
