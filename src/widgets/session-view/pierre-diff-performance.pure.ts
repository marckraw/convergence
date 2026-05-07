export interface PierreDiffPerformancePlan {
  lineCount: number
  virtualize: boolean
  useWorkerPool: boolean
}

export const PIERRE_DIFF_VIRTUALIZATION_LINE_THRESHOLD = 300
export const PIERRE_DIFF_WORKER_POOL_LINE_THRESHOLD = 900

export function planPierreDiffPerformance(
  diff: string,
): PierreDiffPerformancePlan {
  const lineCount = countDiffLines(diff)

  return {
    lineCount,
    virtualize: lineCount >= PIERRE_DIFF_VIRTUALIZATION_LINE_THRESHOLD,
    useWorkerPool: lineCount >= PIERRE_DIFF_WORKER_POOL_LINE_THRESHOLD,
  }
}

export function buildLargePierreDiffFixture(lineCount: number): string {
  const lines = ['@@ -1,1 +1,1 @@']

  for (let index = 1; index < lineCount; index += 1) {
    lines.push(`+const generatedLine${index} = ${index}`)
  }

  return lines.join('\n')
}

function countDiffLines(diff: string): number {
  if (!diff) return 0
  return diff.split('\n').length
}
