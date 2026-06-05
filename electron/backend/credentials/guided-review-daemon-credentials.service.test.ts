import { execFile } from 'child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GUIDED_REVIEW_DAEMON_KEYCHAIN_ACCOUNT,
  GUIDED_REVIEW_DAEMON_KEYCHAIN_SERVICE,
  GUIDED_REVIEW_DAEMON_TOKEN_ENV_KEY,
  GuidedReviewDaemonCredentialsService,
} from './guided-review-daemon-credentials.service'

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

describe('GuidedReviewDaemonCredentialsService', () => {
  beforeEach(() => {
    execFileMock.mockReset()
    vi.stubEnv(GUIDED_REVIEW_DAEMON_TOKEN_ENV_KEY, '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('reports environment configuration without touching Keychain', async () => {
    vi.stubEnv(GUIDED_REVIEW_DAEMON_TOKEN_ENV_KEY, 'daemon-env-token')

    const status = await new GuidedReviewDaemonCredentialsService().getStatus()

    expect(status).toMatchObject({
      providerId: 'guided-review-daemon',
      configured: true,
      source: 'environment',
      storage: null,
    })
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('resolves a stored Keychain token', async () => {
    mockDarwin()
    mockSecurityWithStoredToken('daemon-keychain-token')

    const token =
      await new GuidedReviewDaemonCredentialsService().resolveToken()

    expect(token).toBe('daemon-keychain-token')
    expect(execFileMock).toHaveBeenCalledWith(
      'security',
      [
        'find-generic-password',
        '-a',
        GUIDED_REVIEW_DAEMON_KEYCHAIN_ACCOUNT,
        '-s',
        GUIDED_REVIEW_DAEMON_KEYCHAIN_SERVICE,
        '-w',
      ],
      expect.objectContaining({ timeout: 5_000 }),
      expect.any(Function),
    )
  })

  it('writes the daemon token to the app Keychain item', async () => {
    mockDarwin()
    mockSecurityWithStoredToken('daemon-saved-token')

    await new GuidedReviewDaemonCredentialsService().setToken({
      token: ' daemon-saved-token ',
    })

    expect(execFileMock).toHaveBeenCalledWith(
      'security',
      [
        'add-generic-password',
        '-a',
        GUIDED_REVIEW_DAEMON_KEYCHAIN_ACCOUNT,
        '-s',
        GUIDED_REVIEW_DAEMON_KEYCHAIN_SERVICE,
        '-w',
        'daemon-saved-token',
        '-U',
      ],
      expect.objectContaining({ timeout: 5_000 }),
      expect.any(Function),
    )
  })
})
