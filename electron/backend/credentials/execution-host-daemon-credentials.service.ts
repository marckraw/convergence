import { execFile } from 'child_process'
import { DEFAULT_EXECUTION_HOST_ENDPOINT_ID } from '../execution-host-endpoint/execution-host-endpoint.pure'
import {
  addGenericPasswordCommand,
  describeSecurityFailure,
  keychainAccountsForService,
  keychainPasswordHex,
} from './execution-host-daemon-credentials.pure'

export interface ExecutionHostDaemonCredentialStatus {
  providerId: 'execution-host-daemon'
  configured: boolean
  source: 'environment' | 'keychain' | null
  storage: 'keychain' | null
  account: string | null
  service: string | null
  error: string | null
}

export interface ExecutionHostDaemonTokenInput {
  token: string
}

/**
 * The environment override, as a fact the settings surface can render
 * (MAR-2642).
 *
 * It is not a Keychain entry, so no sweep can ever clean it up and no Endpoint
 * row records it. If it is set while nothing carries the id it serves, it
 * authenticates nothing and no surface would otherwise say so — an invisible
 * dead credential, which is the shape of lie this era exists to stop.
 */
export interface ExecutionHostDaemonEnvironmentOverride {
  /** Whether the variable is set at all. */
  configured: boolean
  /** The variable's name, so a message can say what to unset. */
  envKey: string
  /** The single Endpoint id it can serve, and the only one. */
  endpointId: string
}

export const EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY =
  'CONVERGENCE_EXECUTION_HOST_DAEMON_TOKEN'
export const EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE =
  'convergence.execution-host-daemon'

/**
 * The exit status `security` uses for "the specified item could not be found
 * in the keychain" (`errSecItemNotFound`).
 *
 * It is the only failure that means the same thing as success for a delete, so
 * it is the only one any caller here is allowed to treat that way.
 */
const KEYCHAIN_ITEM_NOT_FOUND_EXIT_CODE = 44

/** A `security` invocation that failed, carrying the status it failed with. */
class SecurityCommandError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
  ) {
    super(message)
    this.name = 'SecurityCommandError'
  }
}

function isDarwin(): boolean {
  return process.platform === 'darwin'
}

/**
 * `security` exits with an OSStatus-derived code; a `security` that could not
 * run at all fails with a string `code` (`ENOENT`) or none, so only a number is
 * ever read as a status.
 */
function exitCodeOf(error: unknown): number | null {
  const code = (error as { code?: unknown } | null | undefined)?.code
  return typeof code === 'number' ? code : null
}

/** True only for "there is no such item" — never for "I could not look". */
function isKeychainItemNotFound(error: unknown): boolean {
  return (
    error instanceof SecurityCommandError &&
    error.exitCode === KEYCHAIN_ITEM_NOT_FOUND_EXIT_CODE
  )
}

interface SecurityInvocation {
  args: string[]
  /**
   * Written to the process's stdin, which is then closed. This is where a
   * secret travels: `argv` is readable from the process table by anything on
   * the machine, and stdin is not.
   */
  stdin?: string
  /** Values that must never appear in the error this invocation rejects with. */
  redact?: readonly string[]
  timeoutMs?: number
  maxBuffer?: number
}

const SECURITY_TIMEOUT_MS = 5_000

function execSecurity(invocation: SecurityInvocation): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'security',
      invocation.args,
      {
        timeout: invocation.timeoutMs ?? SECURITY_TIMEOUT_MS,
        ...(invocation.maxBuffer === undefined
          ? {}
          : { maxBuffer: invocation.maxBuffer }),
      },
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
    // A `security` that never spawned has no stdin, and one that exited first
    // breaks the pipe. Both are already reported through the callback above,
    // so the stream's own error must not surface as an unhandled one.
    child.stdin?.on('error', () => {})
    child.stdin?.end(invocation.stdin)
  })
}

async function readKeychainPassword(
  endpointId: string,
): Promise<string | null> {
  if (!isDarwin()) return null
  try {
    const value = await execSecurity({
      args: [
        'find-generic-password',
        '-a',
        endpointId,
        '-s',
        EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
        '-w',
      ],
    })
    return value || null
  } catch {
    return null
  }
}

/**
 * Destroys the token filed under an Endpoint's Keychain account, and reports
 * whether it is gone (MAR-2642).
 *
 * Only `errSecItemNotFound` resolves: there was nothing to destroy, which is
 * the state the caller asked for. Every other failure — a locked keychain, a
 * denied authorization prompt, no `security` binary at all — left the token
 * exactly where it was, and returning normally from those would report a
 * destruction that never happened.
 */
async function deleteKeychainPassword(endpointId: string): Promise<void> {
  try {
    await execSecurity({
      args: [
        'delete-generic-password',
        '-a',
        endpointId,
        '-s',
        EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
      ],
    })
  } catch (error) {
    if (isKeychainItemNotFound(error)) return
    throw error
  }
}

/**
 * A dump of the login keychain's attributes — no `-d`, so no password data is
 * requested and no authorization prompt is raised.
 *
 * Its own, longer timeout and its own buffer ceiling: it is the only
 * invocation here whose size is set by how much the user keeps in their
 * keychain rather than by this feature, and Node truncates past `maxBuffer` by
 * killing the child, which would read as a keychain that refused.
 */
const KEYCHAIN_DUMP_TIMEOUT_MS = 30_000
const KEYCHAIN_DUMP_MAX_BUFFER = 64 * 1024 * 1024

/**
 * The environment override predates Endpoints and names no machine, so it
 * serves only the Endpoint the single-host era became. Letting it answer for
 * every Endpoint would hand a second daemon the first one's token — the exact
 * cross-machine confusion Endpoints exist to prevent.
 */
function environmentTokenFor(endpointId: string): string | undefined {
  if (endpointId !== DEFAULT_EXECUTION_HOST_ENDPOINT_ID) return undefined
  return process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY]
}

/**
 * API token for a Remote Execution Host daemon: environment variable first,
 * macOS keychain otherwise.
 *
 * The Keychain account is the Endpoint's id (MAR-2620). Two daemons must never
 * share one token: the second would authenticate as the first, or silently
 * overwrite it. The Endpoint migrated from the single-host era carries the id
 * `'default'`, which is the account name this service already used, so the one
 * token that is already stored keeps resolving and nothing about the remote
 * path changes.
 *
 * `endpointId` is required at every call rather than defaulted, so a caller
 * that has not decided which machine it means has to say so.
 *
 * Every public method runs through `serialize`, so work against one Endpoint's
 * credential never interleaves: the Keychain is a shared mutable store and the
 * order two `security` processes happen to finish in is not the order the user
 * asked for. A token Save dispatched before a removal must not land after it
 * and recreate the credential of a machine that is gone. `serialize` takes the
 * queue synchronously, before its first `await`, so a caller only has to reach
 * it without awaiting anything first (MAR-2642).
 */
export class ExecutionHostDaemonCredentialsService {
  /**
   * The tail of each Endpoint's credential queue: a promise that settles when
   * everything asked for so far has finished, successfully or not. Keyed by
   * Endpoint id because two different machines have nothing to serialize
   * against each other, and dropped once its queue drains.
   */
  private readonly pending = new Map<string, Promise<void>>()

  private serialize<T>(endpointId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(endpointId) ?? Promise.resolve()
    // `previous` never rejects — it is a settled-swallowing tail — so the next
    // piece of work always runs, and one failed Save cannot wedge the queue.
    const result = previous.then(work)
    const settled = result.then(
      () => undefined,
      () => undefined,
    )
    this.pending.set(endpointId, settled)
    void settled.then(() => {
      if (this.pending.get(endpointId) === settled) {
        this.pending.delete(endpointId)
      }
    })
    return result
  }

  /**
   * Whether the environment override is set, and which Endpoint it serves.
   *
   * Reads no secret and returns none: the surface that renders this only needs
   * to know that a credential exists which no sweep can reach.
   */
  describeEnvironmentOverride(): ExecutionHostDaemonEnvironmentOverride {
    return {
      configured: !!process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY],
      envKey: EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY,
      endpointId: DEFAULT_EXECUTION_HOST_ENDPOINT_ID,
    }
  }

  async getStatus(
    endpointId: string,
  ): Promise<ExecutionHostDaemonCredentialStatus> {
    return this.serialize(endpointId, () => this.readStatus(endpointId))
  }

  /**
   * The status of what is stored, without taking the queue.
   *
   * Every serialized method that has just changed a credential reports through
   * this one: re-entering `getStatus` from inside the queue would wait for a
   * slot the caller is already holding, and the save would never return.
   */
  private async readStatus(
    endpointId: string,
  ): Promise<ExecutionHostDaemonCredentialStatus> {
    if (environmentTokenFor(endpointId)) {
      return {
        providerId: 'execution-host-daemon',
        configured: true,
        source: 'environment',
        storage: null,
        account: null,
        service: null,
        error: null,
      }
    }

    if (!isDarwin()) {
      return {
        providerId: 'execution-host-daemon',
        configured: false,
        source: null,
        storage: null,
        account: null,
        service: null,
        error: 'Keychain credential storage is only available on macOS.',
      }
    }

    const token = await readKeychainPassword(endpointId)
    return {
      providerId: 'execution-host-daemon',
      configured: !!token,
      source: token ? 'keychain' : null,
      storage: token ? 'keychain' : null,
      account: token ? endpointId : null,
      service: token ? EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE : null,
      error: null,
    }
  }

  /**
   * Files a pasted token under this Endpoint's Keychain account (MAR-2642).
   *
   * The token never appears in `argv`. `security` is run in its interactive
   * mode, which reads the command from stdin, and the token is handed over as
   * hex so that nothing about it can be reinterpreted on the way — see
   * `keychainPasswordHex`. A secret in a command line is readable from the
   * process table by everything else running on the machine, and no error path
   * has to be careful about a value that was never there.
   */
  async setToken(
    input: ExecutionHostDaemonTokenInput,
    endpointId: string,
  ): Promise<ExecutionHostDaemonCredentialStatus> {
    return this.serialize(endpointId, async () => {
      if (!isDarwin()) {
        throw new Error(
          'Keychain credential storage is only available on macOS.',
        )
      }

      const token = input.token.trim()
      if (!token) {
        throw new Error('Daemon API token cannot be empty.')
      }

      const passwordHex = keychainPasswordHex(token)
      await execSecurity({
        args: ['-i'],
        stdin: addGenericPasswordCommand({
          account: endpointId,
          service: EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
          passwordHex,
        }),
        redact: [token, passwordHex],
      })

      return this.readStatus(endpointId)
    })
  }

  async deleteToken(
    endpointId: string,
  ): Promise<ExecutionHostDaemonCredentialStatus> {
    return this.serialize(endpointId, async () => {
      if (!isDarwin()) {
        throw new Error(
          'Keychain credential storage is only available on macOS.',
        )
      }

      await deleteKeychainPassword(endpointId)

      return this.readStatus(endpointId)
    })
  }

  /**
   * Forgets the token of an Endpoint that has just stopped existing
   * (MAR-2642).
   *
   * A credential lives and dies with its Endpoint. The Keychain account *is*
   * the Endpoint id, so an entry left behind by a removal is a token for a
   * machine nobody can see any more — invisible in Settings, unremovable
   * through the UI, and still readable by anything filed under that account.
   *
   * Distinct from `deleteToken`, which is an explicit gesture and refuses
   * loudly where there is no Keychain to act on. This runs after a save the
   * user already committed to and there is no gesture left to refuse: off
   * macOS there is no Keychain at all, so there is no credential that could
   * outlive anything. It still rejects when a Keychain refuses the delete, so
   * the caller can say the cleanup is owed — `sweepEndpoints` is what collects
   * that debt later.
   */
  async forgetEndpoint(endpointId: string): Promise<void> {
    return this.serialize(endpointId, async () => {
      if (!isDarwin()) return
      await deleteKeychainPassword(endpointId)
    })
  }

  /**
   * Destroys every stored credential whose Endpoint no longer exists, and
   * answers with the accounts it emptied (MAR-2642).
   *
   * The Keychain and the settings database are two systems, so a removal
   * cannot be one write. The save commits first, because the alternative
   * order destroys a token and then discovers the commit failed — a loss
   * nothing can undo, against an orphan that no Endpoint will ever bear the id
   * of again and that therefore authenticates nothing. That leaves a residue
   * when the cleanup after the commit fails, and this is what makes the
   * residue temporary: everything filed under this service belongs to an
   * Endpoint, so an account that is not one is garbage by definition.
   *
   * `isLive` is a question, not a snapshot, and it is asked again inside each
   * account's own queue slot. The listing is read before the first delete is
   * reached, and an Endpoint added in between is not an orphan.
   *
   * One refusal does not end the sweep: a locked entry is the next sweep's
   * problem, and the entries after it are still garbage today.
   *
   * Serialized within one Endpoint, concurrent across Endpoints, and those are
   * not in tension (MAR-2642). The queue exists because two `security`
   * processes against *one* account finish in whatever order the OS picks; it
   * says nothing about different machines. Run one after another and a
   * Keychain that blocks on the first account — an authorization prompt nobody
   * is there to answer, a `security` that hangs to its timeout — holds every
   * later account's cleanup hostage to a machine it has nothing to do with. So
   * each orphan is dispatched into its own queue and they are all settled
   * together; a failure is recorded against its own account rather than ending
   * the batch.
   */
  async sweepEndpoints(
    isLive: (endpointId: string) => boolean,
  ): Promise<string[]> {
    if (!isDarwin()) return []

    const dump = await execSecurity({
      args: ['dump-keychain'],
      timeoutMs: KEYCHAIN_DUMP_TIMEOUT_MS,
      maxBuffer: KEYCHAIN_DUMP_MAX_BUFFER,
    })
    const orphans = keychainAccountsForService(
      dump,
      EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
    ).filter((account) => !isLive(account))

    const settled = await Promise.allSettled(
      orphans.map((account) =>
        this.serialize(account, async () => {
          if (isLive(account)) return false
          await deleteKeychainPassword(account)
          return true
        }),
      ),
    )

    // Read back off the listing rather than pushed as each delete lands, so
    // the answer is in the order the Keychain was listed however the
    // concurrent deletes happened to finish.
    return orphans.filter((_, index) => {
      const result = settled[index]
      return result.status === 'fulfilled' && result.value
    })
  }

  async resolveToken(endpointId: string): Promise<string | null> {
    return this.serialize(endpointId, async () => {
      const envToken = environmentTokenFor(endpointId)
      if (envToken) return envToken
      return readKeychainPassword(endpointId)
    })
  }
}
