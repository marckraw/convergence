import { execFile } from 'child_process'

export interface CommandResult {
  stdout: string
  stderr: string
}

export type CommandRunner = (
  binaryPath: string,
  args: string[],
  options?: { cwd?: string },
) => Promise<CommandResult>

export const execFileRunner: CommandRunner = (binaryPath, args, options) =>
  new Promise((resolve, reject) => {
    execFile(
      binaryPath,
      args,
      {
        cwd: options?.cwd,
        timeout: 15_000,
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              stderr.trim() ||
                (error instanceof Error ? error.message : 'Command failed'),
            ),
          )
          return
        }

        resolve({ stdout, stderr })
      },
    )
  })
