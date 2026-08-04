import { describe, expect, it } from 'vitest'
import {
  buildCodexAccountEnv,
  CODEX_ACCOUNT_ENV_FORBIDDEN,
} from './provider-account-codex-env.pure'

const ACCOUNT = { configDir: '/home/.convergence/provider-accounts/codex/a' }

describe('buildCodexAccountEnv', () => {
  it('leaves the environment untouched when no account is selected', () => {
    // Same rule as Claude: with no selection there is nothing to outrank, and
    // stripping inherited variables would itself be a behaviour change.
    const baseEnv = {
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'sk-live',
      SOMETHING_ELSE: 'kept',
    }

    expect(buildCodexAccountEnv({ baseEnv, account: null })).toEqual(baseEnv)
  })

  it('points CODEX_HOME at the account, which is the whole of the isolation', () => {
    const env = buildCodexAccountEnv({
      baseEnv: { PATH: '/usr/bin' },
      account: ACCOUNT,
    })

    expect(env.CODEX_HOME).toBe(ACCOUNT.configDir)
  })

  it('refuses to inherit a key that outranks the ChatGPT login', () => {
    // An OPENAI_API_KEY in the environment bills a different identity while
    // the app claims to be running the selected account.
    const env = buildCodexAccountEnv({
      baseEnv: {
        PATH: '/usr/bin',
        OPENAI_API_KEY: 'sk-live',
        CODEX_API_KEY: 'sk-live',
        OPENAI_BASE_URL: 'https://elsewhere.example',
      },
      account: ACCOUNT,
    })

    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.CODEX_API_KEY).toBeUndefined()
    expect(env.OPENAI_BASE_URL).toBeUndefined()
  })

  it('ignores an inherited CODEX_HOME rather than letting it fight the account', () => {
    const env = buildCodexAccountEnv({
      baseEnv: { PATH: '/usr/bin', CODEX_HOME: '/somewhere/else' },
      account: ACCOUNT,
    })

    expect(env.CODEX_HOME).toBe(ACCOUNT.configDir)
  })

  it('keeps only what an allowlist admits', () => {
    // Allowlist, not blocklist: a future credential variable Convergence has
    // never heard of is excluded by default rather than by name.
    const env = buildCodexAccountEnv({
      baseEnv: {
        PATH: '/usr/bin',
        HOME: '/home/tester',
        SOME_FUTURE_CODEX_TOKEN: 'secret',
      },
      account: ACCOUNT,
    })

    expect(env.PATH).toBe('/usr/bin')
    expect(env.HOME).toBe('/home/tester')
    expect(env.SOME_FUTURE_CODEX_TOKEN).toBeUndefined()
  })

  it('passes Convergence and telemetry prefixes through', () => {
    const env = buildCodexAccountEnv({
      baseEnv: {
        CONVERGENCE_SOMETHING: 'ours',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
      },
      account: ACCOUNT,
    })

    expect(env.CONVERGENCE_SOMETHING).toBe('ours')
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://localhost:4318')
  })

  it('refuses to spawn when an injection smuggles a credential back in', () => {
    // Defence in depth: unreachable while the lists agree, which is exactly
    // why it is worth having.
    expect(() =>
      buildCodexAccountEnv({
        baseEnv: { PATH: '/usr/bin' },
        account: ACCOUNT,
        injections: { OPENAI_API_KEY: 'sk-live' },
      }),
    ).toThrow(/outranks the ChatGPT login/)
  })

  it('refuses to spawn when an injection redirects CODEX_HOME', () => {
    expect(() =>
      buildCodexAccountEnv({
        baseEnv: { PATH: '/usr/bin' },
        account: ACCOUNT,
        injections: { CODEX_HOME: '/somewhere/else' },
      }),
    ).toThrow(/does not match the selected account/)
  })

  it('never allowlists anything it also forbids', () => {
    const env = buildCodexAccountEnv({
      baseEnv: Object.fromEntries(
        CODEX_ACCOUNT_ENV_FORBIDDEN.map((name) => [name, 'x']),
      ),
      account: ACCOUNT,
    })

    for (const name of CODEX_ACCOUNT_ENV_FORBIDDEN) {
      if (name === 'CODEX_HOME') continue
      expect(env[name]).toBeUndefined()
    }
  })
})
