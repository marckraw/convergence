import { execFile } from 'child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OPENROUTER_ENV_KEY,
  OPENROUTER_KEYCHAIN_ACCOUNT,
  OPENROUTER_KEYCHAIN_SERVICE,
  OpenRouterCredentialsService,
} from './openrouter-credentials.service'

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

const execFileMock = vi.mocked(execFile)

function mockDarwin(): void {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
}

function mockSecurityWithStoredToken(token: string): void {
  execFileMock.mockImplementation((_file, args, _options, callback) => {
    const command = Array.isArray(args) ? args[0] : null
    if (command === 'find-generic-password') {
      callback?.(null, `${token}\n`, '')
      return null as never
    }
    callback?.(null, '', '')
    return null as never
  })
}

describe('OpenRouterCredentialsService', () => {
  beforeEach(() => {
    execFileMock.mockReset()
    vi.stubEnv(OPENROUTER_ENV_KEY, '')
    vi.stubEnv('USER', 'test-user')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('reports environment configuration without touching Keychain', async () => {
    vi.stubEnv(OPENROUTER_ENV_KEY, 'sk-or-env')

    const status = await new OpenRouterCredentialsService().getStatus()

    expect(status).toMatchObject({
      configured: true,
      source: 'environment',
      storage: null,
    })
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('injects a Keychain token into a provider environment', async () => {
    mockDarwin()
    mockSecurityWithStoredToken('sk-or-keychain')

    const env = await new OpenRouterCredentialsService().withOpenRouterEnv({
      PATH: '/usr/bin',
    })

    expect(env).toMatchObject({
      PATH: '/usr/bin',
      [OPENROUTER_ENV_KEY]: 'sk-or-keychain',
    })
    expect(execFileMock).toHaveBeenCalledWith(
      'security',
      [
        'find-generic-password',
        '-a',
        OPENROUTER_KEYCHAIN_ACCOUNT,
        '-s',
        OPENROUTER_KEYCHAIN_SERVICE,
        '-w',
      ],
      expect.objectContaining({ timeout: 5_000 }),
      expect.any(Function),
    )
  })

  it('writes the app Keychain item and the pi-compatible legacy item', async () => {
    mockDarwin()
    mockSecurityWithStoredToken('sk-or-saved')

    await new OpenRouterCredentialsService().setToken({
      token: ' sk-or-saved ',
    })

    expect(execFileMock).toHaveBeenCalledWith(
      'security',
      [
        'add-generic-password',
        '-a',
        OPENROUTER_KEYCHAIN_ACCOUNT,
        '-s',
        OPENROUTER_KEYCHAIN_SERVICE,
        '-w',
        'sk-or-saved',
        '-U',
      ],
      expect.objectContaining({ timeout: 5_000 }),
      expect.any(Function),
    )
    expect(execFileMock).toHaveBeenCalledWith(
      'security',
      [
        'add-generic-password',
        '-a',
        'test-user',
        '-s',
        'openrouter',
        '-w',
        'sk-or-saved',
        '-U',
      ],
      expect.objectContaining({ timeout: 5_000 }),
      expect.any(Function),
    )
  })
})
