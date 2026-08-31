import { describe, expect, it } from 'vitest'
import {
  buildClaudeAccountEnv,
  CLAUDE_ACCOUNT_ENV_ALLOWLIST,
  CLAUDE_ACCOUNT_ENV_FORBIDDEN,
} from './provider-account-env.pure'

const ACCOUNT = {
  configDir: '/Users/tester/.convergence/provider-accounts/claude/acct-a',
  credentialDir:
    '/Users/tester/.convergence/provider-credentials/claude/acct-a',
}

function realisticEnv(): NodeJS.ProcessEnv {
  return {
    PATH: '/usr/local/bin:/usr/bin',
    HOME: '/Users/tester',
    SHELL: '/bin/zsh',
    LANG: 'en_US.UTF-8',
    TMPDIR: '/var/folders/tmp/',
    ANTHROPIC_API_KEY: 'sk-ant-should-never-travel',
    CLAUDE_CODE_OAUTH_TOKEN: 'oauth-should-never-travel',
    SOME_PERSONAL_VAR: 'kept-only-for-the-default-account',
  }
}

describe('buildClaudeAccountEnv — ambient default account', () => {
  it('returns the base environment byte-for-byte when no account is selected', () => {
    const baseEnv = realisticEnv()

    const env = buildClaudeAccountEnv({ baseEnv, account: null })

    expect(env).toEqual(baseEnv)
  })

  it('keeps inherited credentials for the default account, because that is today', () => {
    // Stripping these with no account selected would itself be a behaviour
    // change: a user who sets ANTHROPIC_API_KEY today gets API billing today.
    const env = buildClaudeAccountEnv({
      baseEnv: realisticEnv(),
      account: null,
    })

    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-should-never-travel')
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('oauth-should-never-travel')
  })

  it('applies injections over the inherited environment', () => {
    const baseEnv = realisticEnv()

    const env = buildClaudeAccountEnv({
      baseEnv,
      account: null,
      injections: {
        OTEL_LOGS_EXPORTER: 'otlp',
        CONVERGENCE_CLAUDE_DEFERRED_TOOL_RESPONSE: '{"ok":true}',
      },
    })

    expect(env).toEqual({
      ...baseEnv,
      OTEL_LOGS_EXPORTER: 'otlp',
      CONVERGENCE_CLAUDE_DEFERRED_TOOL_RESPONSE: '{"ok":true}',
    })
  })
})

describe('buildClaudeAccountEnv — selected account', () => {
  it('drops every credential that would outrank the selected account', () => {
    const env = buildClaudeAccountEnv({
      baseEnv: {
        ...realisticEnv(),
        ANTHROPIC_AUTH_TOKEN: 'token',
        CCR_OAUTH_TOKEN_FILE: '/tmp/token.json',
        CLAUDE_CODE_USE_BEDROCK: '1',
      },
      account: ACCOUNT,
    })

    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
    expect(env.CCR_OAUTH_TOKEN_FILE).toBeUndefined()
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined()
  })

  it('drops unknown variables rather than enumerating what to remove', () => {
    // The allowlist's whole point: a credential variable a future Claude
    // release introduces is excluded without anyone having heard of it.
    const env = buildClaudeAccountEnv({
      baseEnv: {
        ...realisticEnv(),
        ANTHROPIC_FUTURE_CREDENTIAL_2027: 'not-invented-here',
      },
      account: ACCOUNT,
    })

    expect(env.ANTHROPIC_FUTURE_CREDENTIAL_2027).toBeUndefined()
    expect(env.SOME_PERSONAL_VAR).toBeUndefined()
  })

  it('keeps the process basics a Claude run needs', () => {
    const env = buildClaudeAccountEnv({
      baseEnv: realisticEnv(),
      account: ACCOUNT,
    })

    expect(env.PATH).toBe('/usr/local/bin:/usr/bin')
    expect(env.HOME).toBe('/Users/tester')
    expect(env.SHELL).toBe('/bin/zsh')
    expect(env.LANG).toBe('en_US.UTF-8')
    expect(env.TMPDIR).toBe('/var/folders/tmp/')
  })

  it('points the child at the account credential slot', () => {
    const env = buildClaudeAccountEnv({
      baseEnv: {
        ...realisticEnv(),
        CLAUDE_CONFIG_DIR: '/inherited/config',
        CLAUDE_SECURESTORAGE_CONFIG_DIR: '/inherited/credentials',
      },
      account: ACCOUNT,
    })

    expect(env.CLAUDE_CONFIG_DIR).toBe(ACCOUNT.configDir)
    expect(env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(ACCOUNT.credentialDir)
  })

  it('passes the user own OTLP telemetry configuration through', () => {
    const env = buildClaudeAccountEnv({
      baseEnv: {
        ...realisticEnv(),
        CLAUDE_CODE_ENABLE_TELEMETRY: '1',
        OTEL_LOGS_EXPORTER: 'otlp',
        OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: 'https://otel.example.com/v1/logs',
        OTEL_EXPORTER_OTLP_HEADERS: 'authorization=Bearer their-own-token',
      },
      account: ACCOUNT,
    })

    expect(env.CLAUDE_CODE_ENABLE_TELEMETRY).toBe('1')
    expect(env.OTEL_LOGS_EXPORTER).toBe('otlp')
    expect(env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT).toBe(
      'https://otel.example.com/v1/logs',
    )
    expect(env.OTEL_EXPORTER_OTLP_HEADERS).toBe(
      'authorization=Bearer their-own-token',
    )
  })

  it('lets the deferred tool response survive to the hook', () => {
    const env = buildClaudeAccountEnv({
      baseEnv: {
        ...realisticEnv(),
        CONVERGENCE_CLAUDE_SKILL_TELEMETRY: '0',
      },
      account: ACCOUNT,
      injections: {
        CONVERGENCE_CLAUDE_DEFERRED_TOOL_RESPONSE: '{"answers":[]}',
      },
    })

    expect(env.CONVERGENCE_CLAUDE_DEFERRED_TOOL_RESPONSE).toBe('{"answers":[]}')
    expect(env.CONVERGENCE_CLAUDE_SKILL_TELEMETRY).toBe('0')
  })

  it('inherits the variables a configured stdio MCP server asks for', () => {
    const env = buildClaudeAccountEnv({
      baseEnv: {
        ...realisticEnv(),
        GITHUB_TOKEN: 'ghp-for-the-mcp-server',
        SENTRY_DSN: 'https://sentry.example.com/1',
      },
      account: ACCOUNT,
      passthroughNames: ['GITHUB_TOKEN', 'SENTRY_DSN'],
    })

    expect(env.GITHUB_TOKEN).toBe('ghp-for-the-mcp-server')
    expect(env.SENTRY_DSN).toBe('https://sentry.example.com/1')
  })

  it('refuses to smuggle a credential in through the MCP passthrough list', () => {
    const env = buildClaudeAccountEnv({
      baseEnv: realisticEnv(),
      account: ACCOUNT,
      passthroughNames: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'],
    })

    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
  })

  it('throws rather than spawn when an injection carries a credential', () => {
    expect(() =>
      buildClaudeAccountEnv({
        baseEnv: realisticEnv(),
        account: ACCOUNT,
        injections: { ANTHROPIC_API_KEY: 'sk-ant-injected' },
      }),
    ).toThrow(/outranks subscription OAuth/)
  })

  it('throws when an injection overwrites the account directories', () => {
    expect(() =>
      buildClaudeAccountEnv({
        baseEnv: realisticEnv(),
        account: ACCOUNT,
        injections: { CLAUDE_SECURESTORAGE_CONFIG_DIR: '/somewhere/else' },
      }),
    ).toThrow(/do not match the selected account/)
  })

  it('keeps the allowlist and the forbidden list disjoint', () => {
    for (const name of CLAUDE_ACCOUNT_ENV_FORBIDDEN) {
      expect(CLAUDE_ACCOUNT_ENV_ALLOWLIST).not.toContain(name)
    }
  })
})
