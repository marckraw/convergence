import { execFile } from 'child_process'

export interface GuidedReviewDaemonCredentialStatus {
  providerId: 'guided-review-daemon'
  configured: boolean
  source: 'environment' | 'keychain' | null
  storage: 'keychain' | null
  account: string | null
  service: string | null
  error: string | null
}

export interface GuidedReviewDaemonTokenInput {
  token: string
}

export const GUIDED_REVIEW_DAEMON_TOKEN_ENV_KEY =
  'CONVERGENCE_GUIDED_REVIEW_DAEMON_TOKEN'
export const GUIDED_REVIEW_DAEMON_KEYCHAIN_SERVICE =
  'convergence.guided-review-daemon'
export const GUIDED_REVIEW_DAEMON_KEYCHAIN_ACCOUNT = 'default'

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
      GUIDED_REVIEW_DAEMON_KEYCHAIN_ACCOUNT,
      '-s',
      GUIDED_REVIEW_DAEMON_KEYCHAIN_SERVICE,
      '-w',
    ])
    return value || null
  } catch {
    return null
  }
}

export class GuidedReviewDaemonCredentialsService {
  async getStatus(): Promise<GuidedReviewDaemonCredentialStatus> {
    if (process.env[GUIDED_REVIEW_DAEMON_TOKEN_ENV_KEY]) {
      return {
        providerId: 'guided-review-daemon',
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
        providerId: 'guided-review-daemon',
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
      providerId: 'guided-review-daemon',
      configured: !!token,
      source: token ? 'keychain' : null,
      storage: token ? 'keychain' : null,
      account: token ? GUIDED_REVIEW_DAEMON_KEYCHAIN_ACCOUNT : null,
      service: token ? GUIDED_REVIEW_DAEMON_KEYCHAIN_SERVICE : null,
      error: null,
    }
  }

  async setToken(
    input: GuidedReviewDaemonTokenInput,
  ): Promise<GuidedReviewDaemonCredentialStatus> {
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
      GUIDED_REVIEW_DAEMON_KEYCHAIN_ACCOUNT,
      '-s',
      GUIDED_REVIEW_DAEMON_KEYCHAIN_SERVICE,
      '-w',
      token,
      '-U',
    ])

    return this.getStatus()
  }

  async deleteToken(): Promise<GuidedReviewDaemonCredentialStatus> {
    if (!isDarwin()) {
      throw new Error('Keychain credential storage is only available on macOS.')
    }

    try {
      await execSecurity([
        'delete-generic-password',
        '-a',
        GUIDED_REVIEW_DAEMON_KEYCHAIN_ACCOUNT,
        '-s',
        GUIDED_REVIEW_DAEMON_KEYCHAIN_SERVICE,
      ])
    } catch {
      // Missing credentials are already deleted.
    }

    return this.getStatus()
  }

  async resolveToken(): Promise<string | null> {
    const envToken = process.env[GUIDED_REVIEW_DAEMON_TOKEN_ENV_KEY]
    if (envToken) return envToken
    return readKeychainPassword()
  }
}
