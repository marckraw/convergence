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

function enoent(path: string): NodeJS.ErrnoException {
  const error = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException
  error.code = 'ENOENT'
  return error
}

/**
 * In-memory `.claude.json` store — no test may reach the real one.
 *
 * `rename` mimics the real filesystem contract: it moves whatever the temp
 * path holds onto the target path, so assertions can keep reading the final
 * config by its real path exactly as before the write became atomic.
 */
function fakeIo(files: Record<string, unknown>) {
  const written: Record<string, string> = {}
  const io: ClaudeConfigIo = {
    readFile: vi.fn(async (path: string) => {
      if (written[path] !== undefined) return written[path]
      if (!(path in files)) throw enoent(path)
      return JSON.stringify(files[path])
    }),
    writeFile: vi.fn(async (path: string, contents: string) => {
      written[path] = contents
    }),
    rename: vi.fn(async (from: string, to: string) => {
      written[to] = written[from]
      delete written[from]
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
    rename: vi.fn(async () => {
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
  it('RUN57 resolved ambient key set is exact — inject an extra environment key turns red', async () => {
    const env = await resolveClaudeAccountEnv({
      account: null,
      workingDirectory: CWD,
      baseEnv: BASE_ENV,
      homeDir: HOME,
      io: explodingIo(),
    })

    expect(Object.keys(env).sort()).toEqual([
      'ANTHROPIC_API_KEY',
      'HOME',
      'PATH',
      'SOME_PERSONAL_VAR',
    ])
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

  it('R2 M4 telemetry endpoint is exact — replace endpoint while forwarding turns red', async () => {
    const env = await resolveClaudeAccountEnv({
      account: null,
      workingDirectory: CWD,
      baseEnv: BASE_ENV,
      homeDir: HOME,
      io: explodingIo(),
      injections: {
        OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: 'http://127.0.0.1:1234/v1/logs',
      },
    })

    expect(Object.keys(env).sort()).toEqual([
      'ANTHROPIC_API_KEY',
      'HOME',
      'OTEL_EXPORTER_OTLP_LOGS_ENDPOINT',
      'PATH',
      'SOME_PERSONAL_VAR',
    ])
    expect(env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT).toBe(
      'http://127.0.0.1:1234/v1/logs',
    )
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

  it('R2 M4 resolved account directories are exact — substitute directory after the guard turns red', async () => {
    const { io } = fakeIo({ [`${HOME}/.claude.json`]: {} })

    const env = await resolveClaudeAccountEnv({
      account: ACCOUNT,
      workingDirectory: CWD,
      baseEnv: BASE_ENV,
      homeDir: HOME,
      io,
    })

    expect(Object.keys(env).sort()).toEqual([
      'CLAUDE_CONFIG_DIR',
      'CLAUDE_SECURESTORAGE_CONFIG_DIR',
      'HOME',
      'PATH',
    ])
    expect({
      configDir: env.CLAUDE_CONFIG_DIR,
      credentialDir: env.CLAUDE_SECURESTORAGE_CONFIG_DIR,
    }).toEqual(ACCOUNT)
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

    expect(Object.keys(env).sort()).toEqual([
      'CLAUDE_CONFIG_DIR',
      'CLAUDE_SECURESTORAGE_CONFIG_DIR',
      'GITHUB_TOKEN',
      'HOME',
      'PATH',
    ])
  })

  it('still resolves an environment when the reconcile write fails', async () => {
    const io: ClaudeConfigIo = {
      readFile: vi.fn(async () => JSON.stringify({})),
      writeFile: vi.fn(async () => {
        throw new Error('EACCES')
      }),
      rename: vi.fn(async () => {}),
    }

    const env = await resolveClaudeAccountEnv({
      account: ACCOUNT,
      workingDirectory: CWD,
      baseEnv: BASE_ENV,
      homeDir: HOME,
      io,
    })

    // A failed reconcile costs a trust prompt, never the wrong credential.
    expect(Object.keys(env).sort()).toEqual([
      'CLAUDE_CONFIG_DIR',
      'CLAUDE_SECURESTORAGE_CONFIG_DIR',
      'HOME',
      'PATH',
    ])
  })

  it('survives an absent shared profile', async () => {
    const { io } = fakeIo({})

    const env = await resolveClaudeAccountEnv({
      account: ACCOUNT,
      workingDirectory: CWD,
      baseEnv: BASE_ENV,
      homeDir: HOME,
      io,
    })

    expect(Object.keys(env).sort()).toEqual([
      'CLAUDE_CONFIG_DIR',
      'CLAUDE_SECURESTORAGE_CONFIG_DIR',
      'HOME',
      'PATH',
    ])
  })

  it('seeds a brand-new account config file (ENOENT is absent, not unreadable)', async () => {
    const { io, written } = fakeIo({
      [`${HOME}/.claude.json`]: {
        mcpServers: { linear: { command: 'npx' } },
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
    expect(config).toEqual({ mcpServers: { linear: { command: 'npx' } } })
  })

  it('does not overwrite an account config that fails to parse (a partial read)', async () => {
    const writeFile = vi.fn(async () => {
      throw new Error('must not write when the read is untrustworthy')
    })
    const rename = vi.fn(async () => {
      throw new Error('must not rename when the read is untrustworthy')
    })
    const io: ClaudeConfigIo = {
      readFile: vi.fn(async (path: string) => {
        if (path === `${HOME}/.claude.json`) {
          return JSON.stringify({
            mcpServers: { linear: { command: 'npx' } },
          })
        }
        if (path === `${ACCOUNT.configDir}/.claude.json`) {
          // Truncated mid-write — valid on-disk bytes, invalid JSON.
          return '{"oauthAccount": {"emailAddress": "b@example.com"'
        }
        throw enoent(path)
      }),
      writeFile,
      rename,
    }

    const notes: string[] = []
    const env = await resolveClaudeAccountEnv({
      account: ACCOUNT,
      workingDirectory: CWD,
      baseEnv: BASE_ENV,
      homeDir: HOME,
      io,
      onNote: (text) => notes.push(text),
    })

    expect(writeFile).not.toHaveBeenCalled()
    expect(rename).not.toHaveBeenCalled()
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain(`${ACCOUNT.configDir}/.claude.json`)
    expect(Object.keys(env).sort()).toEqual([
      'CLAUDE_CONFIG_DIR',
      'CLAUDE_SECURESTORAGE_CONFIG_DIR',
      'HOME',
      'PATH',
    ])
  })

  it.each([
    ['a JSON array', '[]'],
    ['a bare JSON string', '"just a string"'],
  ])(
    'does not overwrite an account config whose JSON parses but is not an object (%s)',
    async (_label, raw) => {
      const writeFile = vi.fn(async () => {
        throw new Error('must not write a non-object document')
      })
      const rename = vi.fn(async () => {
        throw new Error('must not rename a non-object document')
      })
      const io: ClaudeConfigIo = {
        readFile: vi.fn(async (path: string) => {
          if (path === `${HOME}/.claude.json`) return JSON.stringify({})
          if (path === `${ACCOUNT.configDir}/.claude.json`) return raw
          throw enoent(path)
        }),
        writeFile,
        rename,
      }

      const notes: string[] = []
      await resolveClaudeAccountEnv({
        account: ACCOUNT,
        workingDirectory: CWD,
        baseEnv: BASE_ENV,
        homeDir: HOME,
        io,
        onNote: (text) => notes.push(text),
      })

      expect(writeFile).not.toHaveBeenCalled()
      expect(rename).not.toHaveBeenCalled()
      expect(notes).toHaveLength(1)
    },
  )

  it('writes the reconciled config atomically: a temp file in the same directory, then a rename onto the real path', async () => {
    const realPath = `${ACCOUNT.configDir}/.claude.json`
    const writeFile = vi.fn(async (_path: string, _contents: string) => {})
    const rename = vi.fn(async (_from: string, _to: string) => {})
    const io: ClaudeConfigIo = {
      readFile: vi.fn(async (path: string) => {
        if (path === `${HOME}/.claude.json`) {
          return JSON.stringify({
            mcpServers: { linear: { command: 'npx' } },
          })
        }
        throw enoent(path)
      }),
      writeFile,
      rename,
    }

    await resolveClaudeAccountEnv({
      account: ACCOUNT,
      workingDirectory: CWD,
      baseEnv: BASE_ENV,
      homeDir: HOME,
      io,
    })

    expect(writeFile).toHaveBeenCalledTimes(1)
    const [tempPath] = writeFile.mock.calls[0]
    expect(tempPath).not.toBe(realPath)
    expect(tempPath.startsWith(`${ACCOUNT.configDir}/`)).toBe(true)

    expect(rename).toHaveBeenCalledTimes(1)
    expect(rename).toHaveBeenCalledWith(tempPath, realPath)
  })

  it('removes the temp file when rename fails, leaving the original untouched', async () => {
    const realPath = `${ACCOUNT.configDir}/.claude.json`
    const originalBytes = JSON.stringify({
      oauthAccount: { emailAddress: 'b@example.com' },
    })
    const store: Record<string, string> = { [realPath]: originalBytes }

    const rm = vi.fn(async (path: string) => {
      delete store[path]
    })
    const io: ClaudeConfigIo = {
      readFile: vi.fn(async (path: string) => {
        if (path === `${HOME}/.claude.json`) {
          return JSON.stringify({
            mcpServers: { linear: { command: 'npx' } },
          })
        }
        if (path in store) return store[path]
        throw enoent(path)
      }),
      writeFile: vi.fn(async (path: string, contents: string) => {
        store[path] = contents
      }),
      rename: vi.fn(async () => {
        throw new Error('EBUSY: rename failed')
      }),
      rm,
    }

    const env = await resolveClaudeAccountEnv({
      account: ACCOUNT,
      workingDirectory: CWD,
      baseEnv: BASE_ENV,
      homeDir: HOME,
      io,
    })

    expect(rm).toHaveBeenCalledTimes(1)
    const [tempPath] = rm.mock.calls[0]
    expect(tempPath).not.toBe(realPath)
    expect(store[tempPath]).toBeUndefined()
    expect(store[realPath]).toBe(originalBytes)
    expect(Object.keys(env).sort()).toEqual([
      'CLAUDE_CONFIG_DIR',
      'CLAUDE_SECURESTORAGE_CONFIG_DIR',
      'HOME',
      'PATH',
    ])
  })
})
