import { execFile } from 'child_process'
import { delimiter } from 'path'
import {
  buildShellPathProbeCommand,
  extractShellPathFromStdout,
  mergePathValues,
} from './shell-path.shared.pure'
import { getFallbackPathEntries } from './shell-path.darwin.pure'

function runShellPathProbe(shellPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      shellPath,
      ['-ilc', buildShellPathProbeCommand()],
      {
        timeout: 5_000,
        env: { ...process.env },
      },
      (error, stdout) => {
        if (error) {
          resolve(null)
          return
        }

        resolve(extractShellPathFromStdout(stdout))
      },
    )
  })
}

export async function hydrateProcessPath(): Promise<void> {
  const shellPath = process.env.SHELL || '/bin/zsh'
  const shellPathValue = await runShellPathProbe(shellPath)
  const fallbackPath = getFallbackPathEntries().join(delimiter)

  process.env.PATH = mergePathValues(
    shellPathValue,
    process.env.PATH,
    fallbackPath,
  )
}
