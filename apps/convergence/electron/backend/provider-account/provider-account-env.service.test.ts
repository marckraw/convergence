import { describe, expect, it, vi } from 'vitest'
import {
  resolveClaudeAccountEnv,
  type ClaudeConfigIo,
} from './provider-account-env.service'

const HOME = '/Users/tester'
const CWD = '/Users/tester/Projects/convergence'
const ACCOUNT = {
  configDir: `${HOME}/.convergence/provider-accounts/claude/acct-a`,
  credentialDir: `${HOME}/.convergence/provider-credentials/claude/acct-a`,
}

/** In-memory `.claude.json` store — no test may reach the real one. */
function fakeIo(files: Record<string, unknown>) {
  const written: Record<string, string> = {}
  const io: ClaudeConfigIo = {
    readFile: vi.fn(async (path: string) => {
      if (written[path] !== undefined) return written[path]
      if (!(path in files)) throw new Error(`ENOENT: ${path}`)
      return JSON.stringify(files[path])
    }),
    writeFile: vi.fn(async (path: string, contents: string) => {
      written[path] = contents
    }),
  }
  return { io, written }
}

function explodingIo(): ClaudeConfigIo {
  return {
    readFile: vi.fn(async () => {
      throw new Error('the filesystem must not be touched here')
    }),
    writeFile: vi.fn(async () => {
      throw new Error('the filesystem must not be touched here')
    }),
  }
}

const BASE_ENV: NodeJS.ProcessEnv = {
  PATH: '/usr/local/bin',
  HOME,
  ANTHROPIC_API_KEY: 'sk-ant-inherited',
  SOME_PERSONAL_VAR: 'personal',
}

describe('resolveClaudeAccountEnv — ambient default account', () => {
  it('is byte-equivalent to the environment Convergence spawns today', async () => {
    const env = await resolveClaudeAccountEnv({
      account: null,
      workingDirectory: CWD,
      baseEnv: BASE_ENV,
      homeDir: HOME,
      io: explodingIo(),
    })

    expect(env).toEqual({ ...BASE_ENV })
  })

  it('reads and writes nothing when no account is selected', async () => {
    const io = explodingIo()

    await resolveClaudeAccountEnv({
      account: null,
      workingDirectory: CWD,
      baseEnv: BASE_ENV,
      homeDir: HOME,
      io,
    })

    expect(io.readFile).not.toHaveBeenCalled()
    expect(io.writeFile).not.toHaveBeenCalled()
  })

  it('still applies the telemetry and deferred-tool injections', async () => {
    const env = await resolveClaudeAccountEnv({
      account: null,
      workingDirectory: CWD,
      baseEnv: BASE_ENV,
      homeDir: HOME,
      io: explodingIo(),
      injections: {
        OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: 'http://127.0.0.1:1234/v1/logs',
        CONVERGENCE_CLAUDE_DEFERRED_TOOL_RESPONSE: '{"answers":[]}',
      },
    })

    expect(env).toEqual({
      ...BASE_ENV,
      OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: 'http://127.0.0.1:1234/v1/logs',
      CONVERGENCE_CLAUDE_DEFERRED_TOOL_RESPONSE: '{"answers":[]}',
    })
  })
})

describe('resolveClaudeAccountEnv — selected account', () => {
  it('reconciles trust and servers into the account config at spawn', async () => {
    const { io, written } = fakeIo({
      [`${HOME}/.claude.json`]: {
        mcpServers: { linear: { command: 'npx' } },
        projects: { [CWD]: { hasTrustDialogAccepted: true } },
      },
      [`${ACCOUNT.configDir}/.claude.json`]: {
        oauthAccount: { emailAddress: 'b@example.com' },
      },
    })

    await resolveClaudeAccountEnv({
      account: ACCOUNT,
      workingDirectory: CWD,
      baseEnv: BASE_ENV,
      homeDir: HOME,
      io,
    })

    const config = JSON.parse(written[`${ACCOUNT.configDir}/.claude.json`])
    expect(config).toEqual({
      oauthAccount: { emailAddress: 'b@example.com' },
      mcpServers: { linear: { command: 'npx' } },
      projects: { [CWD]: { hasTrustDialogAccepted: true } },
    })
  })

  it('does not rewrite a config that already agrees', async () => {
    const shared = {
      mcpServers: { linear: { command: 'npx' } },
      projects: { [CWD]: { hasTrustDialogAccepted: true } },
    }
    const { io } = fakeIo({
      [`${HOME}/.claude.json`]: shared,
      [`${ACCOUNT.configDir}/.claude.json`]: shared,
    })

    await resolveClaudeAccountEnv({
      account: ACCOUNT,
      workingDirectory: CWD,
      baseEnv: BASE_ENV,
      homeDir: HOME,
      io,
    })

    expect(io.writeFile).not.toHaveBeenCalled()
  })

  it('allowlists the environment and points at the account slot', async () => {
    const { io } = fakeIo({ [`${HOME}/.claude.json`]: {} })

    const env = await resolveClaudeAccountEnv({
      account: ACCOUNT,
      workingDirectory: CWD,
      baseEnv: BASE_ENV,
      homeDir: HOME,
      io,
    })

    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.SOME_PERSONAL_VAR).toBeUndefined()
    expect(env.PATH).toBe('/usr/local/bin')
    expect(env.CLAUDE_CONFIG_DIR).toBe(ACCOUNT.configDir)
    expect(env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(ACCOUNT.credentialDir)
  })

  it('lets a configured stdio MCP server keep the variables it references', async () => {
    const { io } = fakeIo({
      [`${HOME}/.claude.json`]: {
        mcpServers: {
          github: {
            command: 'npx',
            env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
          },
        },
      },
    })

    const env = await resolveClaudeAccountEnv({
      account: ACCOUNT,
      workingDirectory: CWD,
      baseEnv: { ...BASE_ENV, GITHUB_TOKEN: 'ghp-real' },
      homeDir: HOME,
      io,
    })

    expect(env.GITHUB_TOKEN).toBe('ghp-real')
  })

  it('still resolves an environment when the reconcile write fails', async () => {
    const io: ClaudeConfigIo = {
      readFile: vi.fn(async () => JSON.stringify({})),
      writeFile: vi.fn(async () => {
        throw new Error('EACCES')
      }),
    }

    const env = await resolveClaudeAccountEnv({
      account: ACCOUNT,
      workingDirectory: CWD,
      baseEnv: BASE_ENV,
      homeDir: HOME,
      io,
    })

    // A failed reconcile costs a trust prompt, never the wrong credential.
    expect(env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(ACCOUNT.credentialDir)
  })

  it('survives an unreadable shared profile', async () => {
    const { io } = fakeIo({})

    const env = await resolveClaudeAccountEnv({
      account: ACCOUNT,
      workingDirectory: CWD,
      baseEnv: BASE_ENV,
      homeDir: HOME,
      io,
    })

    expect(env.CLAUDE_CONFIG_DIR).toBe(ACCOUNT.configDir)
  })
})
