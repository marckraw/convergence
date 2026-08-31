import { execFile } from 'child_process'
import { userInfo } from 'os'

export interface OpenRouterCredentialStatus {
  providerId: 'openrouter'
  configured: boolean
  source: 'environment' | 'keychain' | null
  storage: 'keychain' | null
  account: string | null
  service: string | null
  error: string | null
}

export interface OpenRouterTokenInput {
  token: string
}

export const OPENROUTER_ENV_KEY = 'OPENROUTER_API_KEY'
export const OPENROUTER_KEYCHAIN_SERVICE = 'convergence.openrouter'
export const OPENROUTER_KEYCHAIN_ACCOUNT = 'default'

const LEGACY_OPENROUTER_KEYCHAIN_SERVICE = 'openrouter'

function currentUsername(): string {
  return process.env.USER || userInfo().username || 'default'
}

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
  service: string,
  account: string,
): Promise<string | null> {
  if (!isDarwin()) return null
  try {
    const value = await execSecurity([
      'find-generic-password',
      '-a',
      account,
      '-s',
      service,
      '-w',
    ])
    return value || null
  } catch {
    return null
  }
}

async function findStoredToken(): Promise<{
  token: string
  service: string
  account: string
} | null> {
  const primary = await readKeychainPassword(
    OPENROUTER_KEYCHAIN_SERVICE,
    OPENROUTER_KEYCHAIN_ACCOUNT,
  )
  if (primary) {
    return {
      token: primary,
      service: OPENROUTER_KEYCHAIN_SERVICE,
      account: OPENROUTER_KEYCHAIN_ACCOUNT,
    }
  }

  const legacyAccount = currentUsername()
  const legacy = await readKeychainPassword(
    LEGACY_OPENROUTER_KEYCHAIN_SERVICE,
    legacyAccount,
  )
  if (legacy) {
    return {
      token: legacy,
      service: LEGACY_OPENROUTER_KEYCHAIN_SERVICE,
      account: legacyAccount,
    }
  }

  return null
}

export class OpenRouterCredentialsService {
  async getStatus(): Promise<OpenRouterCredentialStatus> {
    if (process.env[OPENROUTER_ENV_KEY]) {
      return {
        providerId: 'openrouter',
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
        providerId: 'openrouter',
        configured: false,
        source: null,
        storage: null,
        account: null,
        service: null,
        error: 'Keychain credential storage is only available on macOS.',
      }
    }

    const stored = await findStoredToken()
    return {
      providerId: 'openrouter',
      configured: !!stored,
      source: stored ? 'keychain' : null,
      storage: stored ? 'keychain' : null,
      account: stored?.account ?? null,
      service: stored?.service ?? null,
      error: null,
    }
  }

  async setToken(
    input: OpenRouterTokenInput,
  ): Promise<OpenRouterCredentialStatus> {
    if (!isDarwin()) {
      throw new Error('Keychain credential storage is only available on macOS.')
    }

    const token = input.token.trim()
    if (!token) {
      throw new Error('OpenRouter API key cannot be empty.')
    }

    const targets = [
      {
        service: OPENROUTER_KEYCHAIN_SERVICE,
        account: OPENROUTER_KEYCHAIN_ACCOUNT,
      },
      {
        service: LEGACY_OPENROUTER_KEYCHAIN_SERVICE,
        account: currentUsername(),
      },
    ]

    await Promise.all(
      targets.map(({ service, account }) =>
        execSecurity([
          'add-generic-password',
          '-a',
          account,
          '-s',
          service,
          '-w',
          token,
          '-U',
        ]),
      ),
    )

    return this.getStatus()
  }

  async deleteToken(): Promise<OpenRouterCredentialStatus> {
    if (!isDarwin()) {
      throw new Error('Keychain credential storage is only available on macOS.')
    }

    const targets = [
      {
        service: OPENROUTER_KEYCHAIN_SERVICE,
        account: OPENROUTER_KEYCHAIN_ACCOUNT,
      },
      {
        service: LEGACY_OPENROUTER_KEYCHAIN_SERVICE,
        account: currentUsername(),
      },
    ]

    await Promise.all(
      targets.map(async ({ service, account }) => {
        try {
          await execSecurity([
            'delete-generic-password',
            '-a',
            account,
            '-s',
            service,
          ])
        } catch {
          // Missing credentials are already deleted.
        }
      }),
    )

    return this.getStatus()
  }

  async resolveToken(): Promise<string | null> {
    const envToken = process.env[OPENROUTER_ENV_KEY]
    if (envToken) return envToken
    return (await findStoredToken())?.token ?? null
  }

  async withOpenRouterEnv(
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<NodeJS.ProcessEnv> {
    if (env[OPENROUTER_ENV_KEY]) return { ...env }

    const token = await this.resolveToken()
    if (!token) return { ...env }

    return {
      ...env,
      [OPENROUTER_ENV_KEY]: token,
    }
  }
}
