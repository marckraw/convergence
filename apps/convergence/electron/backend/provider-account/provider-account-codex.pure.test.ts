import { describe, expect, it } from 'vitest'
import {
  buildCodexAccountLoginCommand,
  buildCodexAccountLogoutCommand,
  readCodexIdentityFromAuth,
  CODEX_AUTH_FILE_MODE,
} from './provider-account-codex.pure'

const CONFIG_DIR = '/home/.convergence/provider-accounts/codex/acct-a'
const BASE_ENV = { PATH: '/usr/local/bin', HOME: '/home/tester' }

describe('buildCodexAccountLoginCommand', () => {
  it('logs in against the account own CODEX_HOME', () => {
    // The one-way door. A login with the shared CODEX_HOME rewrites the
    // machine's default Codex identity, and nothing says so afterwards.
    const command = buildCodexAccountLoginCommand({
      binaryPath: '/usr/local/bin/codex',
      configDir: CONFIG_DIR,
      baseEnv: BASE_ENV,
    })

    expect(command.command).toBe('/usr/local/bin/codex')
    expect(command.args).toEqual(['login'])
    expect(command.env.CODEX_HOME).toBe(CONFIG_DIR)
  })

  it('carries no inherited API key into the login', () => {
    const command = buildCodexAccountLoginCommand({
      binaryPath: '/usr/local/bin/codex',
      configDir: CONFIG_DIR,
      baseEnv: { ...BASE_ENV, OPENAI_API_KEY: 'sk-live' },
    })

    expect(command.env.OPENAI_API_KEY).toBeUndefined()
  })

  it('refuses a login with no home of its own', () => {
    expect(() =>
      buildCodexAccountLoginCommand({
        binaryPath: '/usr/local/bin/codex',
        configDir: '   ',
        baseEnv: BASE_ENV,
      }),
    ).toThrow(/would overwrite the shared one/)
  })
})

describe('buildCodexAccountLogoutCommand', () => {
  it('signs out only the account home it was given', () => {
    const command = buildCodexAccountLogoutCommand({
      binaryPath: '/usr/local/bin/codex',
      configDir: CONFIG_DIR,
      baseEnv: BASE_ENV,
    })

    expect(command.args).toEqual(['logout'])
    expect(command.env.CODEX_HOME).toBe(CONFIG_DIR)
  })

  it('refuses a logout that would sign out the shared login', () => {
    expect(() =>
      buildCodexAccountLogoutCommand({
        binaryPath: '/usr/local/bin/codex',
        configDir: '',
        baseEnv: BASE_ENV,
      }),
    ).toThrow(/would sign out the shared one/)
  })
})

describe('readCodexIdentityFromAuth', () => {
  it('reads the encoded ID token written by Codex 0.154.0', () => {
    const claims = {
      email: 'fixture@example.com',
      'https://api.openai.com/auth': {
        chatgpt_account_id: 'workspace-a',
        chatgpt_plan_type: 'team',
      },
    }
    const idToken = `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`
    expect(
      readCodexIdentityFromAuth({
        tokens: { id_token: idToken, account_id: 'workspace-a' },
      }),
    ).toEqual({
      email: 'fixture@example.com',
      orgId: 'workspace-a',
      plan: 'team',
    })
  })

  it('reads a workspace id from namespaced token claims when no selected account id is recorded', () => {
    const idToken = `header.${Buffer.from(JSON.stringify({ email: 'fixture@example.com', 'https://api.openai.com/auth': { chatgpt_account_id: 'workspace-a' } })).toString('base64url')}.signature`
    expect(
      readCodexIdentityFromAuth({ tokens: { id_token: idToken } })?.orgId,
    ).toBe('workspace-a')
  })

  it.each(['garbage', 'a.invalid-json.c', 'a.W10.c', 'a.bnVsbA.c'])(
    'does not throw on a malformed encoded token: %s',
    (id_token) => {
      expect(readCodexIdentityFromAuth({ tokens: { id_token } })).toBeNull()
    },
  )

  it('reads identity from the auth file the home reports about itself', () => {
    expect(
      readCodexIdentityFromAuth({
        tokens: {
          access_token: 'at',
          account_id: 'acc_123',
          id_token: {
            email: 'someone@example.com',
            chatgpt_account_id: 'acc_123',
            chatgpt_plan_type: 'pro',
          },
        },
      }),
    ).toEqual({
      email: 'someone@example.com',
      orgId: 'acc_123',
      plan: 'pro',
    })
  })

  it('falls back to the account id inside the token when none is at the root', () => {
    expect(
      readCodexIdentityFromAuth({
        tokens: {
          id_token: {
            email: 'someone@example.com',
            chatgpt_account_id: 'acc_456',
          },
        },
      })?.orgId,
    ).toBe('acc_456')
  })

  it('reports no plan rather than guessing one', () => {
    expect(
      readCodexIdentityFromAuth({
        tokens: { id_token: { email: 'someone@example.com' } },
      })?.plan,
    ).toBeNull()
  })

  it('returns null rather than inventing an identity', () => {
    expect(readCodexIdentityFromAuth(null)).toBeNull()
    expect(readCodexIdentityFromAuth({})).toBeNull()
    expect(readCodexIdentityFromAuth({ tokens: {} })).toBeNull()
    expect(readCodexIdentityFromAuth({ tokens: 'nonsense' })).toBeNull()
    expect(
      readCodexIdentityFromAuth({ tokens: { access_token: 'at' } }),
    ).toBeNull()
  })
})

describe('CODEX_AUTH_FILE_MODE', () => {
  it('keeps the plaintext credential readable only by its owner', () => {
    // The keychain does this for Claude. Here the filesystem is the only
    // protection there is.
    expect(CODEX_AUTH_FILE_MODE).toBe(0o600)
  })
})
