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
  it('RUN57 ambient key set is exact — inject an extra environment key turns red', () => {
    const baseEnv = realisticEnv()

    const env = buildClaudeAccountEnv({ baseEnv, account: null })

    expect(Object.keys(env).sort()).toEqual([
      'ANTHROPIC_API_KEY',
      'CLAUDE_CODE_OAUTH_TOKEN',
      'HOME',
      'LANG',
      'PATH',
      'SHELL',
      'SOME_PERSONAL_VAR',
      'TMPDIR',
    ])
  })

  it('keeps inherited credential keys for the default account', () => {
    // Stripping these with no account selected would itself be a behaviour
    // change: a user who sets ANTHROPIC_API_KEY today gets API billing today.
    const env = buildClaudeAccountEnv({
      baseEnv: realisticEnv(),
      account: null,
    })

    expect(Object.keys(env).sort()).toEqual([
      'ANTHROPIC_API_KEY',
      'CLAUDE_CODE_OAUTH_TOKEN',
      'HOME',
      'LANG',
      'PATH',
      'SHELL',
      'SOME_PERSONAL_VAR',
      'TMPDIR',
    ])
  })

  it('applies telemetry injections — drop input.injections turns red', () => {
    const baseEnv = realisticEnv()

    const env = buildClaudeAccountEnv({
      baseEnv,
      account: null,
      injections: {
        OTEL_LOGS_EXPORTER: 'otlp',
      },
    })

    expect(Object.keys(env).sort()).toEqual([
      'ANTHROPIC_API_KEY',
      'CLAUDE_CODE_OAUTH_TOKEN',
      'HOME',
      'LANG',
      'OTEL_LOGS_EXPORTER',
      'PATH',
      'SHELL',
      'SOME_PERSONAL_VAR',
      'TMPDIR',
    ])
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

    expect(Object.keys(env).sort()).toEqual([
      'CLAUDE_CONFIG_DIR',
      'CLAUDE_SECURESTORAGE_CONFIG_DIR',
      'HOME',
      'LANG',
      'PATH',
      'SHELL',
      'TMPDIR',
    ])
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

    expect(Object.keys(env).sort()).toEqual([
      'CLAUDE_CONFIG_DIR',
      'CLAUDE_SECURESTORAGE_CONFIG_DIR',
      'HOME',
      'LANG',
      'PATH',
      'SHELL',
      'TMPDIR',
    ])
  })

  it('keeps the process basics a Claude run needs', () => {
    const env = buildClaudeAccountEnv({
      baseEnv: realisticEnv(),
      account: ACCOUNT,
    })

    expect(Object.keys(env).sort()).toEqual([
      'CLAUDE_CONFIG_DIR',
      'CLAUDE_SECURESTORAGE_CONFIG_DIR',
      'HOME',
      'LANG',
      'PATH',
      'SHELL',
      'TMPDIR',
    ])
  })

  it('includes the two selected-account directory keys', () => {
    const env = buildClaudeAccountEnv({
      baseEnv: {
        ...realisticEnv(),
        CLAUDE_CONFIG_DIR: '/inherited/config',
        CLAUDE_SECURESTORAGE_CONFIG_DIR: '/inherited/credentials',
      },
      account: ACCOUNT,
    })

    expect(Object.keys(env).sort()).toEqual([
      'CLAUDE_CONFIG_DIR',
      'CLAUDE_SECURESTORAGE_CONFIG_DIR',
      'HOME',
      'LANG',
      'PATH',
      'SHELL',
      'TMPDIR',
    ])
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

    expect(Object.keys(env).sort()).toEqual([
      'CLAUDE_CODE_ENABLE_TELEMETRY',
      'CLAUDE_CONFIG_DIR',
      'CLAUDE_SECURESTORAGE_CONFIG_DIR',
      'HOME',
      'LANG',
      'OTEL_EXPORTER_OTLP_HEADERS',
      'OTEL_EXPORTER_OTLP_LOGS_ENDPOINT',
      'OTEL_LOGS_EXPORTER',
      'PATH',
      'SHELL',
      'TMPDIR',
    ])
  })

  it('preserves the connection telemetry switch key', () => {
    const env = buildClaudeAccountEnv({
      baseEnv: {
        ...realisticEnv(),
        CONVERGENCE_CLAUDE_SKILL_TELEMETRY: '0',
      },
      account: ACCOUNT,
    })

    expect(Object.keys(env).sort()).toEqual([
      'CLAUDE_CONFIG_DIR',
      'CLAUDE_SECURESTORAGE_CONFIG_DIR',
      'CONVERGENCE_CLAUDE_SKILL_TELEMETRY',
      'HOME',
      'LANG',
      'PATH',
      'SHELL',
      'TMPDIR',
    ])
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

    expect(Object.keys(env).sort()).toEqual([
      'CLAUDE_CONFIG_DIR',
      'CLAUDE_SECURESTORAGE_CONFIG_DIR',
      'GITHUB_TOKEN',
      'HOME',
      'LANG',
      'PATH',
      'SENTRY_DSN',
      'SHELL',
      'TMPDIR',
    ])
  })

  it('refuses to smuggle a credential in through the MCP passthrough list', () => {
    const env = buildClaudeAccountEnv({
      baseEnv: realisticEnv(),
      account: ACCOUNT,
      passthroughNames: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'],
    })

    expect(Object.keys(env).sort()).toEqual([
      'CLAUDE_CONFIG_DIR',
      'CLAUDE_SECURESTORAGE_CONFIG_DIR',
      'HOME',
      'LANG',
      'PATH',
      'SHELL',
      'TMPDIR',
    ])
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
