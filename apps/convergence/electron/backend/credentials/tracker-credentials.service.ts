import { execFile } from 'child_process'
import { describeSecurityFailure } from './execution-host-daemon-credentials.pure'
import {
  requireTrackerInputLength,
  TRACKER_API_KEY_MAX_LENGTH,
} from '../tracker/tracker-binding.pure'
import {
  addTrackerKeyCommand,
  deleteTrackerKeyArgs,
  findTrackerKeyArgs,
  type TrackerCredentialStatus,
} from './tracker-credentials.pure'

/** `errSecItemNotFound`: the one failure a delete may read as success. */
const KEYCHAIN_ITEM_NOT_FOUND_EXIT_CODE = 44
const SECURITY_TIMEOUT_MS = 5_000

export class SecurityCommandError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
  ) {
    super(message)
    this.name = 'SecurityCommandError'
  }
}

function exitCodeOf(error: unknown): number | null {
  const code = (error as { code?: unknown } | null | undefined)?.code
  return typeof code === 'number' ? code : null
}

export type SecurityRunner = (invocation: {
  args: string[]
  stdin?: string
  redact?: readonly string[]
}) => Promise<string>

/** `security`, with a secret only ever on stdin and never in an error. */
const runSecurity: SecurityRunner = (invocation) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      'security',
      invocation.args,
      { timeout: SECURITY_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new SecurityCommandError(
              describeSecurityFailure({
                stderr,
                message: error.message,
                exitCode: exitCodeOf(error),
                redact: invocation.redact,
              }),
              exitCodeOf(error),
            ),
          )
          return
        }
        resolve(stdout.trim())
      },
    )
    if (invocation.stdin === undefined) return
    child.stdin?.on('error', () => {})
    child.stdin?.end(invocation.stdin)
  })

/**
 * A crew's tracker API key, as a Keychain fact (MAR-3084 R3).
 *
 * Filed under `convergence.tracker` / crew id. `status` answers present or
 * absent and nothing else; `resolveKey` is for the main process's adapter and
 * is deliberately not on any IPC channel.
 */
export class TrackerCredentialsService {
  constructor(
    private readonly deps: {
      run?: SecurityRunner
      platform?: NodeJS.Platform
    } = {},
  ) {}

  private get run(): SecurityRunner {
    return this.deps.run ?? runSecurity
  }

  private requireDarwin(): void {
    if ((this.deps.platform ?? process.platform) !== 'darwin') {
      throw new Error('Keychain credential storage is only available on macOS.')
    }
  }

  async resolveKey(crewId: string): Promise<string | null> {
    if ((this.deps.platform ?? process.platform) !== 'darwin') return null
    try {
      const value = await this.run({ args: findTrackerKeyArgs(crewId) })
      return value || null
    } catch {
      return null
    }
  }

  async status(crewId: string): Promise<TrackerCredentialStatus> {
    return (await this.resolveKey(crewId)) ? 'present' : 'absent'
  }

  async setKey(
    crewId: string,
    apiKey: string,
  ): Promise<TrackerCredentialStatus> {
    this.requireDarwin()
    const key = apiKey.trim()
    if (!key) throw new Error('A tracker API key cannot be empty.')
    requireTrackerInputLength(
      'A tracker API key',
      key,
      TRACKER_API_KEY_MAX_LENGTH,
    )
    const command = addTrackerKeyCommand({ crewId, apiKey: key })
    await this.run({
      args: ['-i'],
      stdin: command.stdin,
      redact: [key, command.passwordHex],
    })
    return this.status(crewId)
  }

  async deleteKey(crewId: string): Promise<TrackerCredentialStatus> {
    this.requireDarwin()
    try {
      await this.run({ args: deleteTrackerKeyArgs(crewId) })
    } catch (error) {
      if (
        !(
          error instanceof SecurityCommandError &&
          error.exitCode === KEYCHAIN_ITEM_NOT_FOUND_EXIT_CODE
        )
      ) {
        throw error
      }
    }
    return this.status(crewId)
  }
}
