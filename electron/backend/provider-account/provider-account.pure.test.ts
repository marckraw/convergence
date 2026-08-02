import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import {
  CLAUDE_KEYCHAIN_ACCOUNT_FALLBACK,
  deriveClaudeKeychainAccount,
  deriveClaudeKeychainService,
  deriveProviderAccountConfigDir,
  deriveProviderAccountCredentialDir,
  hashProviderAccountDir,
  mapProviderAccountRow,
} from './provider-account.pure'
import type { ProviderAccountRow } from './provider-account.types'

const HOME = '/Users/tester'
const ACCOUNT_ID = '0f7c3f5a-2b8d-4d3e-9c11-8a6f2d4e5b70'
const MODULE_DIR = fileURLToPath(new URL('.', import.meta.url))

/**
 * Comments must be free to name the forbidden call — explaining why
 * `app.getPath('userData')` is banned is the point of the docstrings. Strip
 * them so the guard below judges code only.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

function dirInput(
  overrides: Partial<{ providerId: string; accountId: string }> = {},
) {
  return {
    homeDir: HOME,
    providerId: 'claude',
    accountId: ACCOUNT_ID,
    ...overrides,
  }
}

describe('provider account directory derivation', () => {
  it('derives the config directory from the hardcoded constant', () => {
    expect(deriveProviderAccountConfigDir(dirInput())).toBe(
      `${HOME}/.convergence/provider-accounts/claude/${ACCOUNT_ID}`,
    )
  })

  it('pins the credential namespace to a root outside the config directory', () => {
    const configDir = deriveProviderAccountConfigDir(dirInput())
    const credentialDir = deriveProviderAccountCredentialDir(dirInput())

    expect(credentialDir).toBe(
      `${HOME}/.convergence/provider-credentials/claude/${ACCOUNT_ID}`,
    )
    expect(credentialDir.startsWith(configDir)).toBe(false)
  })

  it('rejects path segments that could escape the account root', () => {
    expect(() =>
      deriveProviderAccountConfigDir(dirInput({ accountId: '..' })),
    ).toThrow(/Unsafe provider account accountId/)
    expect(() =>
      deriveProviderAccountConfigDir(dirInput({ accountId: '../../etc' })),
    ).toThrow(/Unsafe provider account accountId/)
    expect(() =>
      deriveProviderAccountCredentialDir(dirInput({ providerId: 'cl/aude' })),
    ).toThrow(/Unsafe provider account providerId/)
  })

  it('never consults app.getPath or Electron to build account paths', () => {
    // The dev-vs-packaged hash split is the trap ADR 0007 documents:
    // `convergence` and `Convergence` are one folder on a case-insensitive
    // disk but two different keychain slots, so a userData-derived path would
    // hide dev-enrolled accounts from the installed build. Guard the whole
    // module directory, not just today's file.
    const sourceFiles = readdirSync(MODULE_DIR).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
    )

    expect(sourceFiles.length).toBeGreaterThan(0)

    for (const file of sourceFiles) {
      const source = stripComments(readFileSync(join(MODULE_DIR, file), 'utf8'))
      expect(source, `${file} must not import electron`).not.toMatch(
        /from\s+['"]electron['"]/,
      )
      expect(source, `${file} must not call app.getPath`).not.toMatch(
        /getPath\s*\(/,
      )
      expect(source, `${file} must not reference userData`).not.toMatch(
        /userData/,
      )
    }
  })

  it('demonstrates why the path is hardcoded: case alone changes the slot', () => {
    const devLike = `${HOME}/Library/Application Support/convergence`
    const packagedLike = `${HOME}/Library/Application Support/Convergence`

    expect(hashProviderAccountDir(devLike)).toBe('55fbda9b')
    expect(hashProviderAccountDir(packagedLike)).toBe('e73e1004')
    expect(hashProviderAccountDir(devLike)).not.toBe(
      hashProviderAccountDir(packagedLike),
    )
  })
})

describe('claude keychain slot naming', () => {
  it('returns the shared default slot when no credential directory is set', () => {
    expect(deriveClaudeKeychainService(null)).toBe('Claude Code-credentials')
    expect(deriveClaudeKeychainService(undefined)).toBe(
      'Claude Code-credentials',
    )
    expect(deriveClaudeKeychainService('')).toBe('Claude Code-credentials')
  })

  it('suffixes on presence of a value, not on the value being non-default', () => {
    // Setting the variable to the default config path itself still produces a
    // hashed slot — the branch is on presence, which is what makes an
    // accidental `CLAUDE_CONFIG_DIR=~/.claude` break login.
    expect(deriveClaudeKeychainService(`${HOME}/.claude`)).toBe(
      'Claude Code-credentials-ee16a9f4',
    )
  })

  it('derives a stable per-account slot from the credential directory', () => {
    expect(
      deriveClaudeKeychainService(
        deriveProviderAccountCredentialDir(dirInput()),
      ),
    ).toBe('Claude Code-credentials-d99fe20b')
  })

  it('honours the OAuth file suffix when Claude Code carries one', () => {
    expect(deriveClaudeKeychainService(null, '-test')).toBe(
      'Claude Code-test-credentials',
    )
  })

  it('normalises the directory to NFC before hashing', () => {
    const base = `${HOME}/.convergence/provider-credentials/claude/caf`
    // Written as code points so the source file itself cannot be silently
    // normalised by an editor: both spell the same directory name.
    const decomposed = `${base}e${String.fromCharCode(0x301)}`
    const precomposed = `${base}${String.fromCharCode(0xe9)}`

    expect(decomposed).not.toBe(precomposed)
    expect(hashProviderAccountDir(decomposed)).toBe('31a1b136')
    expect(hashProviderAccountDir(decomposed)).toBe(
      hashProviderAccountDir(precomposed),
    )
    // Without normalisation the same directory would land in a different slot.
    expect(hashProviderAccountDir(decomposed)).not.toBe('2cde5bba')
  })

  it('falls back when the OS username is missing or not slot-safe', () => {
    expect(deriveClaudeKeychainAccount('marckraw')).toBe('marckraw')
    expect(deriveClaudeKeychainAccount('first.last_1-2')).toBe('first.last_1-2')
    expect(deriveClaudeKeychainAccount('')).toBe(
      CLAUDE_KEYCHAIN_ACCOUNT_FALLBACK,
    )
    expect(deriveClaudeKeychainAccount(undefined)).toBe(
      CLAUDE_KEYCHAIN_ACCOUNT_FALLBACK,
    )
    expect(deriveClaudeKeychainAccount('marc kraw')).toBe(
      CLAUDE_KEYCHAIN_ACCOUNT_FALLBACK,
    )
  })
})

describe('mapProviderAccountRow', () => {
  const row: ProviderAccountRow = {
    id: ACCOUNT_ID,
    provider_id: 'claude-code',
    label: 'Personal Max',
    auth_kind: 'subscription-oauth',
    email: 'someone@example.com',
    org_id: 'ec48ac90',
    plan: 'max',
    config_dir: `${HOME}/.convergence/provider-accounts/claude/${ACCOUNT_ID}`,
    credential_dir: `${HOME}/.convergence/provider-credentials/claude/${ACCOUNT_ID}`,
    execution_host_id: 'local',
    is_default: 1,
    status: 'connected',
    last_validated_at: '2026-08-02T21:00:00.000Z',
    created_at: '2026-08-02T20:00:00.000Z',
    updated_at: '2026-08-02T21:00:00.000Z',
  }

  it('maps a persisted row to the domain model', () => {
    expect(mapProviderAccountRow(row)).toEqual({
      id: ACCOUNT_ID,
      providerId: 'claude-code',
      label: 'Personal Max',
      authKind: 'subscription-oauth',
      email: 'someone@example.com',
      orgId: 'ec48ac90',
      plan: 'max',
      configDir: row.config_dir,
      credentialDir: row.credential_dir,
      executionHostId: 'local',
      isDefault: true,
      status: 'connected',
      lastValidatedAt: '2026-08-02T21:00:00.000Z',
      createdAt: '2026-08-02T20:00:00.000Z',
      updatedAt: '2026-08-02T21:00:00.000Z',
    })
  })

  it('treats any non-1 default flag as not default', () => {
    expect(mapProviderAccountRow({ ...row, is_default: 0 }).isDefault).toBe(
      false,
    )
  })

  it('degrades unknown enum values instead of trusting the row', () => {
    const degraded = mapProviderAccountRow({
      ...row,
      auth_kind: 'something-new',
      status: 'something-new',
    })

    expect(degraded.authKind).toBe('subscription-oauth')
    expect(degraded.status).toBe('connected')
  })
})
