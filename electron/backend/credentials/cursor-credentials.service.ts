import { execFile } from 'child_process'
import { validateCursorAdminApiKey } from './cursor-credentials.pure'

export interface CursorCredentialStatus {
  providerId: 'cursor'
  configured: boolean
  source: 'environment' | 'keychain' | null
  storage: 'keychain' | null
  account: string | null
  service: string | null
  email: string | null
  emailSource: 'environment' | 'keychain' | null
  error: string | null
}

export interface CursorCredentialsInput {
  apiKey: string
  email: string
}

export const CURSOR_ADMIN_API_KEY_ENV = 'CURSOR_ADMIN_API_KEY'
export const CURSOR_USAGE_EMAIL_ENV = 'CURSOR_USAGE_EMAIL'
export const CURSOR_ADMIN_API_KEYCHAIN_SERVICE =
  'convergence.cursor.admin-api-key'
export const CURSOR_USAGE_EMAIL_KEYCHAIN_SERVICE =
  'convergence.cursor.usage-email'
export const CURSOR_KEYCHAIN_ACCOUNT = 'default'

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

async function writeKeychainPassword(
  service: string,
  account: string,
  value: string,
): Promise<void> {
  await execSecurity([
    'add-generic-password',
    '-a',
    account,
    '-s',
    service,
    '-w',
    value,
    '-U',
  ])
}

async function deleteKeychainPassword(
  service: string,
  account: string,
): Promise<void> {
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
}

function envValue(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

export class CursorCredentialsService {
  async getStatus(): Promise<CursorCredentialStatus> {
    const envApiKey = envValue(CURSOR_ADMIN_API_KEY_ENV)
    const envEmail = envValue(CURSOR_USAGE_EMAIL_ENV)
    if (envApiKey) {
      return {
        providerId: 'cursor',
        configured: true,
        source: 'environment',
        storage: null,
        account: null,
        service: null,
        email: envEmail,
        emailSource: envEmail ? 'environment' : null,
        error: null,
      }
    }

    if (!isDarwin()) {
      return {
        providerId: 'cursor',
        configured: false,
        source: null,
        storage: null,
        account: null,
        service: null,
        email: envEmail,
        emailSource: envEmail ? 'environment' : null,
        error: 'Keychain credential storage is only available on macOS.',
      }
    }

    const apiKey = await readKeychainPassword(
      CURSOR_ADMIN_API_KEYCHAIN_SERVICE,
      CURSOR_KEYCHAIN_ACCOUNT,
    )
    const storedEmail = await readKeychainPassword(
      CURSOR_USAGE_EMAIL_KEYCHAIN_SERVICE,
      CURSOR_KEYCHAIN_ACCOUNT,
    )

    return {
      providerId: 'cursor',
      configured: !!apiKey,
      source: apiKey ? 'keychain' : null,
      storage: apiKey ? 'keychain' : null,
      account: apiKey ? CURSOR_KEYCHAIN_ACCOUNT : null,
      service: apiKey ? CURSOR_ADMIN_API_KEYCHAIN_SERVICE : null,
      email: envEmail ?? storedEmail,
      emailSource: envEmail ? 'environment' : storedEmail ? 'keychain' : null,
      error: null,
    }
  }

  async setCredentials(
    input: CursorCredentialsInput,
  ): Promise<CursorCredentialStatus> {
    if (!isDarwin()) {
      throw new Error('Keychain credential storage is only available on macOS.')
    }

    const apiKey = input.apiKey.trim()
    const validationError = validateCursorAdminApiKey(apiKey)
    if (validationError) {
      throw new Error(validationError)
    }

    const email = input.email.trim()
    await writeKeychainPassword(
      CURSOR_ADMIN_API_KEYCHAIN_SERVICE,
      CURSOR_KEYCHAIN_ACCOUNT,
      apiKey,
    )
    if (email) {
      await writeKeychainPassword(
        CURSOR_USAGE_EMAIL_KEYCHAIN_SERVICE,
        CURSOR_KEYCHAIN_ACCOUNT,
        email,
      )
    } else {
      await deleteKeychainPassword(
        CURSOR_USAGE_EMAIL_KEYCHAIN_SERVICE,
        CURSOR_KEYCHAIN_ACCOUNT,
      )
    }

    return this.getStatus()
  }

  async deleteCredentials(): Promise<CursorCredentialStatus> {
    if (!isDarwin()) {
      throw new Error('Keychain credential storage is only available on macOS.')
    }

    await Promise.all([
      deleteKeychainPassword(
        CURSOR_ADMIN_API_KEYCHAIN_SERVICE,
        CURSOR_KEYCHAIN_ACCOUNT,
      ),
      deleteKeychainPassword(
        CURSOR_USAGE_EMAIL_KEYCHAIN_SERVICE,
        CURSOR_KEYCHAIN_ACCOUNT,
      ),
    ])

    return this.getStatus()
  }

  async resolveCredentials(): Promise<{
    apiKey: string | null
    email: string | null
  }> {
    const envApiKey = envValue(CURSOR_ADMIN_API_KEY_ENV)
    const envEmail = envValue(CURSOR_USAGE_EMAIL_ENV)
    if (envApiKey) {
      return {
        apiKey: envApiKey,
        email: envEmail,
      }
    }

    const apiKey = await readKeychainPassword(
      CURSOR_ADMIN_API_KEYCHAIN_SERVICE,
      CURSOR_KEYCHAIN_ACCOUNT,
    )
    const storedEmail = await readKeychainPassword(
      CURSOR_USAGE_EMAIL_KEYCHAIN_SERVICE,
      CURSOR_KEYCHAIN_ACCOUNT,
    )

    return {
      apiKey,
      email: envEmail ?? storedEmail,
    }
  }
}
