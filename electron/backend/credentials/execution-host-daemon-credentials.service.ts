import { execFile } from 'child_process'

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
export const EXECUTION_HOST_DAEMON_KEYCHAIN_ACCOUNT = 'default'

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

async function readKeychainPassword(): Promise<string | null> {
  if (!isDarwin()) return null
  try {
    const value = await execSecurity([
      'find-generic-password',
      '-a',
      EXECUTION_HOST_DAEMON_KEYCHAIN_ACCOUNT,
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
 * API token for the Remote Execution Host daemon. Same storage discipline as
 * the guided-review daemon token: environment variable first, macOS keychain
 * otherwise.
 */
export class ExecutionHostDaemonCredentialsService {
  async getStatus(): Promise<ExecutionHostDaemonCredentialStatus> {
    if (process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY]) {
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

    const token = await readKeychainPassword()
    return {
      providerId: 'execution-host-daemon',
      configured: !!token,
      source: token ? 'keychain' : null,
      storage: token ? 'keychain' : null,
      account: token ? EXECUTION_HOST_DAEMON_KEYCHAIN_ACCOUNT : null,
      service: token ? EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE : null,
      error: null,
    }
  }

  async setToken(
    input: ExecutionHostDaemonTokenInput,
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
      EXECUTION_HOST_DAEMON_KEYCHAIN_ACCOUNT,
      '-s',
      EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
      '-w',
      token,
      '-U',
    ])

    return this.getStatus()
  }

  async deleteToken(): Promise<ExecutionHostDaemonCredentialStatus> {
    if (!isDarwin()) {
      throw new Error('Keychain credential storage is only available on macOS.')
    }

    try {
      await execSecurity([
        'delete-generic-password',
        '-a',
        EXECUTION_HOST_DAEMON_KEYCHAIN_ACCOUNT,
        '-s',
        EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
      ])
    } catch {
      // Missing credentials are already deleted.
    }

    return this.getStatus()
  }

  async resolveToken(): Promise<string | null> {
    const envToken = process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY]
    if (envToken) return envToken
    return readKeychainPassword()
  }
}
