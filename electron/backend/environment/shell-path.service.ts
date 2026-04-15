import { execFile } from 'child_process'
import {
  buildShellPathProbeCommand,
  extractShellPathFromStdout,
  getFallbackPathEntries,
  mergePathValues,
} from './shell-path.pure'

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

export async function hydrateProcessPathFromShell(): Promise<void> {
  if (process.platform !== 'darwin') {
    return
  }

  const shellPath = process.env.SHELL || '/bin/zsh'
  const shellPathValue = await runShellPathProbe(shellPath)
  const fallbackPath = getFallbackPathEntries().join(':')

  process.env.PATH = mergePathValues(
    shellPathValue,
    process.env.PATH,
    fallbackPath,
  )
}
