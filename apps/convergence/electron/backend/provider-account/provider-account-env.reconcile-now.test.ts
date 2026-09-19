import { describe, expect, it, vi } from 'vitest'
import {
  readSharedClaudeMcpServerNames,
  reconcileClaudeAccountConfigNow,
  resolveClaudeAccountEnv,
  type ClaudeConfigIo,
} from './provider-account-env.service'

/**
 * MAR-3185: the spawn's reconciliation, extracted so Connect Linear can run it
 * without a spawn. `provider-account-env.service.test.ts` pins the spawn path
 * unchanged; this file pins the export itself and that the two callers land
 * byte-identical files.
 */

const HOME = '/Users/tester'
const SHARED_FILE = `${HOME}/.claude.json`
const ACCOUNT = {
  configDir: `${HOME}/.convergence/provider-accounts/claude/acct-a`,
  credentialDir: `${HOME}/.convergence/provider-credentials/claude/acct-a`,
}
const ACCOUNT_FILE = `${ACCOUNT.configDir}/.claude.json`
const LINEAR = { type: 'http', url: 'https://mcp.linear.app/mcp' }

function disk(initial: Record<string, string>) {
  const files = new Map(Object.entries(initial))
  const io: ClaudeConfigIo = {
    readFile: vi.fn(async (path: string) => {
      const contents = files.get(path)
      if (contents === undefined)
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
      return contents
    }),
    writeFile: vi.fn(async (path: string, contents: string) => {
      files.set(path, contents)
    }),
    rename: vi.fn(async (from: string, to: string) => {
      files.set(to, files.get(from)!)
      files.delete(from)
    }),
  }
  return { io, files }
}

const STARTING_FILES = {
  [SHARED_FILE]: JSON.stringify({
    mcpServers: { linear: LINEAR },
    projects: { '/repo': { hasTrustDialogAccepted: true } },
  }),
  [ACCOUNT_FILE]: JSON.stringify({
    oauthAccount: { emailAddress: 'a@example.com' },
  }),
}

describe('reconcileClaudeAccountConfigNow (MAR-3185)', () => {
  it('lands the same account file the spawn lands — one implementation, two callers', async () => {
    const viaSpawn = disk(STARTING_FILES)
    const viaNow = disk(STARTING_FILES)

    await resolveClaudeAccountEnv({
      account: ACCOUNT,
      workingDirectory: '/repo',
      baseEnv: { PATH: '/bin', HOME },
      homeDir: HOME,
      io: viaSpawn.io,
    })
    const result = await reconcileClaudeAccountConfigNow({
      account: ACCOUNT,
      workingDirectory: '/repo',
      homeDir: HOME,
      io: viaNow.io,
    })

    expect(result).toMatchObject({ kind: 'reconciled', write: 'written' })
    expect(viaNow.files.get(ACCOUNT_FILE)).toBe(
      viaSpawn.files.get(ACCOUNT_FILE),
    )
    expect(JSON.parse(viaNow.files.get(ACCOUNT_FILE)!)).toEqual({
      oauthAccount: { emailAddress: 'a@example.com' },
      mcpServers: { linear: LINEAR },
      projects: { '/repo': { hasTrustDialogAccepted: true } },
    })
  })

  it('writes nothing when the account already agrees', async () => {
    const d = disk({
      [SHARED_FILE]: JSON.stringify({ mcpServers: { linear: LINEAR } }),
      [ACCOUNT_FILE]: JSON.stringify({ mcpServers: { linear: LINEAR } }),
    })

    const result = await reconcileClaudeAccountConfigNow({
      account: ACCOUNT,
      homeDir: HOME,
      io: d.io,
    })

    expect(result).toMatchObject({ kind: 'reconciled', write: 'unchanged' })
    expect(d.io.writeFile).not.toHaveBeenCalled()
  })

  it('says the write failed instead of swallowing it silently', async () => {
    const d = disk({
      [SHARED_FILE]: JSON.stringify({ mcpServers: { linear: LINEAR } }),
    })
    d.io.rename = vi.fn(async () => {
      throw new Error('EACCES')
    })

    const result = await reconcileClaudeAccountConfigNow({
      account: ACCOUNT,
      homeDir: HOME,
      io: d.io,
    })

    expect(result).toMatchObject({ kind: 'reconciled', write: 'failed' })
  })

  it('reports an untrustworthy account file and writes nothing', async () => {
    const d = disk({
      [SHARED_FILE]: JSON.stringify({ mcpServers: { linear: LINEAR } }),
      [ACCOUNT_FILE]: '{not json',
    })

    const result = await reconcileClaudeAccountConfigNow({
      account: ACCOUNT,
      homeDir: HOME,
      io: d.io,
    })

    expect(result).toEqual({
      kind: 'unreadable',
      accountConfigPath: ACCOUNT_FILE,
    })
    expect(d.io.writeFile).not.toHaveBeenCalled()
  })
})

describe('readSharedClaudeMcpServerNames (MAR-3185)', () => {
  it('names the servers the reconciliation would copy', async () => {
    const d = disk({
      [SHARED_FILE]: JSON.stringify({
        mcpServers: { linear: LINEAR, github: {} },
      }),
    })

    expect(
      await readSharedClaudeMcpServerNames({ homeDir: HOME, io: d.io }),
    ).toEqual(['linear', 'github'])
  })

  it('treats a missing profile or missing mcpServers as no servers', async () => {
    expect(
      await readSharedClaudeMcpServerNames({ homeDir: HOME, io: disk({}).io }),
    ).toEqual([])
    expect(
      await readSharedClaudeMcpServerNames({
        homeDir: HOME,
        io: disk({ [SHARED_FILE]: '{}' }).io,
      }),
    ).toEqual([])
  })

  it('refuses bytes it cannot trust rather than calling them empty', async () => {
    await expect(
      readSharedClaudeMcpServerNames({
        homeDir: HOME,
        io: disk({ [SHARED_FILE]: '{not json' }).io,
      }),
    ).rejects.toThrow(
      `Could not read the shared Claude profile at ${SHARED_FILE}. No connectors were changed.`,
    )
  })
})
