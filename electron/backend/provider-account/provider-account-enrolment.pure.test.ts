import { describe, expect, it } from 'vitest'
import {
  buildProviderAccountLoginCommand,
  buildProviderAccountLogoutCommand,
  deriveProviderAccountLabel,
  findOrphanCredentialDirs,
  readClaudeIdentityFromConfig,
} from './provider-account-enrolment.pure'

const CONFIG_DIR = '/Users/tester/.convergence/provider-accounts/claude/acct-a'
const CREDENTIAL_DIR =
  '/Users/tester/.convergence/provider-credentials/claude/acct-a'

const BASE_ENV: NodeJS.ProcessEnv = {
  PATH: '/usr/local/bin',
  HOME: '/Users/tester',
  ANTHROPIC_API_KEY: 'sk-ant-inherited',
}

describe('buildProviderAccountLoginCommand', () => {
  it('pre-fills the email so the right browser session is authorised', () => {
    const command = buildProviderAccountLoginCommand({
      binaryPath: '/usr/local/bin/claude',
      configDir: CONFIG_DIR,
      credentialDir: CREDENTIAL_DIR,
      email: 'someone@example.com',
      baseEnv: BASE_ENV,
    })

    expect(command.command).toBe('/usr/local/bin/claude')
    expect(command.args).toEqual([
      'auth',
      'login',
      '--email',
      'someone@example.com',
    ])
  })

  it('writes the credential into the account slot, not the default one', () => {
    const command = buildProviderAccountLoginCommand({
      binaryPath: '/usr/local/bin/claude',
      configDir: CONFIG_DIR,
      credentialDir: CREDENTIAL_DIR,
      email: 'someone@example.com',
      baseEnv: BASE_ENV,
    })

    expect(command.env.CLAUDE_CONFIG_DIR).toBe(CONFIG_DIR)
    expect(command.env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(CREDENTIAL_DIR)
  })

  it('does not let an inherited credential authorise the login', () => {
    const command = buildProviderAccountLoginCommand({
      binaryPath: '/usr/local/bin/claude',
      configDir: CONFIG_DIR,
      credentialDir: CREDENTIAL_DIR,
      email: 'someone@example.com',
      baseEnv: BASE_ENV,
    })

    expect(command.env.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it('refuses an empty email rather than opening an ambiguous login', () => {
    expect(() =>
      buildProviderAccountLoginCommand({
        binaryPath: '/usr/local/bin/claude',
        configDir: CONFIG_DIR,
        credentialDir: CREDENTIAL_DIR,
        email: '   ',
        baseEnv: BASE_ENV,
      }),
    ).toThrow(/requires the email address/)
  })
})

describe('buildProviderAccountLogoutCommand', () => {
  it('pairs the account credential namespace with a throwaway config dir', () => {
    // Finding 9: logout under a namespace but with the *shared* config
    // directory wipes the shared profile's oauthAccount block.
    const command = buildProviderAccountLogoutCommand({
      binaryPath: '/usr/local/bin/claude',
      throwawayConfigDir: '/Users/tester/.convergence/tmp/logout-acct-a',
      credentialDir: CREDENTIAL_DIR,
      baseEnv: BASE_ENV,
    })

    expect(command.args).toEqual(['auth', 'logout'])
    expect(command.env.CLAUDE_CONFIG_DIR).toBe(
      '/Users/tester/.convergence/tmp/logout-acct-a',
    )
    expect(command.env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(CREDENTIAL_DIR)
    expect(command.env.CLAUDE_CONFIG_DIR).not.toBe('/Users/tester/.claude')
  })

  it('refuses to log out without a throwaway config directory', () => {
    expect(() =>
      buildProviderAccountLogoutCommand({
        binaryPath: '/usr/local/bin/claude',
        throwawayConfigDir: '',
        credentialDir: CREDENTIAL_DIR,
        baseEnv: BASE_ENV,
      }),
    ).toThrow(/would wipe the shared profile credential/)
  })
})

describe('findOrphanCredentialDirs', () => {
  const root = '/Users/tester/.convergence/provider-credentials/claude'

  it('finds namespaces no enrolled account claims', () => {
    expect(
      findOrphanCredentialDirs({
        credentialRoot: root,
        entriesOnDisk: ['acct-a', 'abandoned-login', 'acct-b'],
        enrolledCredentialDirs: [`${root}/acct-a`, `${root}/acct-b`],
      }),
    ).toEqual([`${root}/abandoned-login`])
  })

  it('claims nothing when every namespace has a row', () => {
    expect(
      findOrphanCredentialDirs({
        credentialRoot: root,
        entriesOnDisk: ['acct-a'],
        enrolledCredentialDirs: [`${root}/acct-a`],
      }),
    ).toEqual([])
  })

  it('handles an empty credential root', () => {
    expect(
      findOrphanCredentialDirs({
        credentialRoot: root,
        entriesOnDisk: [],
        enrolledCredentialDirs: [`${root}/acct-a`],
      }),
    ).toEqual([])
  })
})

describe('readClaudeIdentityFromConfig', () => {
  it('reads identity from the account directory own config', () => {
    expect(
      readClaudeIdentityFromConfig({
        oauthAccount: {
          emailAddress: 'someone@example.com',
          organizationUuid: 'ec48ac90',
          organizationRole: 'admin',
        },
      }),
    ).toEqual({
      email: 'someone@example.com',
      orgId: 'ec48ac90',
      plan: 'admin',
    })
  })

  it('falls back to the subscription type when no role is recorded', () => {
    expect(
      readClaudeIdentityFromConfig({
        oauthAccount: {
          emailAddress: 'someone@example.com',
          subscriptionType: 'max',
        },
      })?.plan,
    ).toBe('max')
  })

  it('returns null rather than inventing an identity', () => {
    expect(readClaudeIdentityFromConfig(null)).toBeNull()
    expect(readClaudeIdentityFromConfig({})).toBeNull()
    expect(readClaudeIdentityFromConfig({ oauthAccount: {} })).toBeNull()
    expect(
      readClaudeIdentityFromConfig({ oauthAccount: 'nonsense' }),
    ).toBeNull()
  })
})

describe('deriveProviderAccountLabel', () => {
  it('prefers an explicit label', () => {
    expect(deriveProviderAccountLabel('a@example.com', 'Work Max')).toBe(
      'Work Max',
    )
  })

  it('falls back to the email so accounts are still tellable apart', () => {
    expect(deriveProviderAccountLabel('a@example.com')).toBe('a@example.com')
    expect(deriveProviderAccountLabel('a@example.com', '  ')).toBe(
      'a@example.com',
    )
  })
})
