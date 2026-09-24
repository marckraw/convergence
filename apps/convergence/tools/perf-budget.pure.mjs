// A streaming reply's first text growth is an append (MAR-3403).
export const FULL_PATCHES_WHILE_STREAMING_MAX = 0

/** Counter contracts are independent of machine speed; missing counters fail closed. */
export function checkPerfBudget(report, exitCode) {
  const failures = []
  const check = (name, value, bound) => {
    if (!Number.isSafeInteger(value) || value < 0 || value > bound)
      failures.push(`${name}: expected 0..${bound}, received ${String(value)}`)
  }
  const sessions = report?.parameters?.sessions
  if (!Number.isSafeInteger(sessions) || sessions < 1)
    failures.push('parameters.sessions: expected a positive integer')
  const previousFailures = failures.length
  check(
    'fullPatchesWhileStreaming.max',
    report?.main?.conversationPatched?.fullPatchesWhileStreaming?.max,
    FULL_PATCHES_WHILE_STREAMING_MAX,
  )
  if (failures.length > previousFailures)
    failures[failures.length - 1] +=
      `; items=${JSON.stringify(report?.main?.conversationPatched?.fullPatchesWhileStreaming?.items)}`
  check(
    'byOp.snapshot',
    report?.main?.conversationPatched?.byOp?.snapshot,
    Number.isSafeInteger(sessions) && sessions > 0 ? sessions : 0,
  )
  check(
    'attentionRowReads.notNeeded',
    report?.main?.attentionRowReads?.notNeeded,
    0,
  )
  const errors = report?.scenario?.rendererErrors
  check(
    'scenario.rendererErrors',
    Array.isArray(errors) ? errors.length : undefined,
    0,
  )
  if (exitCode !== 0)
    failures.push(`runner.exitCode: expected 0, received ${String(exitCode)}`)
  return failures
}

/** Diagnostic values only: none of these rows participate in the verdict. */
export function perfTimingRows(report) {
  const rows = []
  const visit = (value, path = '') => {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      const metric = path ? `${path}.${key}` : key
      if (
        typeof child === 'number' &&
        /cpuPercent|ms$|bytes|elapsedSeconds/i.test(key)
      )
        rows.push({ metric, value: child })
      else if (child && typeof child === 'object') visit(child, metric)
    }
  }
  visit(report)
  return rows
}
