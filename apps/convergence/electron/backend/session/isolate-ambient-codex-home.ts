import { afterEach, beforeEach, vi } from 'vitest'

/**
 * The test that reads `CODEX_HOME` after every other test in the file has
 * put the runner's value back. It is not itself isolated.
 */
export const CODEX_HOME_RESTORED_TEST =
  'restores the runner CODEX_HOME after the isolated tests'

let isolatedTestsFinished = 0

/**
 * Session fixtures spawn Codex from `process.env`. An unassigned conversation
 * is the ambient login, which is the absence of `CODEX_HOME`. A runner that
 * carries one would make that absence look like a directory. Strip it before
 * each test, then restore the previous value exactly, including "was unset".
 */
export function isolateAmbientCodexHome(): void {
  beforeEach((context) => {
    if (context.task.name === CODEX_HOME_RESTORED_TEST) return
    vi.stubEnv('CODEX_HOME', undefined)
  })
  afterEach((context) => {
    if (context.task.name === CODEX_HOME_RESTORED_TEST) return
    vi.unstubAllEnvs()
    isolatedTestsFinished += 1
  })
}

export function isolatedCodexHomeTestsFinished(): number {
  return isolatedTestsFinished
}
