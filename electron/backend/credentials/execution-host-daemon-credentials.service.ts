import { execFile } from 'child_process'
import { DEFAULT_EXECUTION_HOST_ENDPOINT_ID } from '../execution-host-endpoint/execution-host-endpoint.pure'

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

export const EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY =
  'CONVERGENCE_EXECUTION_HOST_DAEMON_TOKEN'
export const EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE =
  'convergence.execution-host-daemon'

function isDarwin(): boolean {
  return process.platform === 'darwin'
}

function execSecurity(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('security', args, { timeout: 5_000 }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr.trim() || error.message
        reject(new Error(message))
        return
      }
      resolve(stdout.trim())
    })
  })
}

async function readKeychainPassword(
  endpointId: string,
): Promise<string | null> {
  if (!isDarwin()) return null
  try {
    const value = await execSecurity([
      'find-generic-password',
      '-a',
      endpointId,
      '-s',
      EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
      '-w',
    ])
    return value || null
  } catch {
    return null
  }
}

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
 */
export class ExecutionHostDaemonCredentialsService {
  async getStatus(
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

  async setToken(
    input: ExecutionHostDaemonTokenInput,
    endpointId: string,
  ): Promise<ExecutionHostDaemonCredentialStatus> {
    if (!isDarwin()) {
      throw new Error('Keychain credential storage is only available on macOS.')
    }

    const token = input.token.trim()
    if (!token) {
      throw new Error('Daemon API token cannot be empty.')
    }

    await execSecurity([
      'add-generic-password',
      '-a',
      endpointId,
      '-s',
      EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
      '-w',
      token,
      '-U',
    ])

    return this.getStatus(endpointId)
  }

  async deleteToken(
    endpointId: string,
  ): Promise<ExecutionHostDaemonCredentialStatus> {
    if (!isDarwin()) {
      throw new Error('Keychain credential storage is only available on macOS.')
    }

    try {
      await execSecurity([
        'delete-generic-password',
        '-a',
        endpointId,
        '-s',
        EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
      ])
    } catch {
      // Missing credentials are already deleted.
    }

    return this.getStatus(endpointId)
  }

  async resolveToken(endpointId: string): Promise<string | null> {
    const envToken = environmentTokenFor(endpointId)
    if (envToken) return envToken
    return readKeychainPassword(endpointId)
  }
}
