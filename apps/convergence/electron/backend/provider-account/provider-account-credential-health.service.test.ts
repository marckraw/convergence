import { expect, it, vi } from 'vitest'
import { tmpdir } from 'os'
import { sep } from 'path'
import { ClaudeCredentialHealthService } from './provider-account-credential-health.service'
import type { ProviderAccountCommand } from './provider-account-enrolment.pure'
import type { ProviderAccount } from './provider-account.types'

const account = {
  id: 'fixture',
  providerId: 'claude-code',
  executionHostId: 'local',
  configDir: '/fixture/config',
  credentialDir: '/fixture/credential',
} as ProviderAccount

it('runs only auth status with both selected namespaces and no ambient token', async () => {
  const run = vi.fn(async (_command: ProviderAccountCommand) => ({
    code: 1,
    stdout: JSON.stringify({
      loggedIn: false,
      authMethod: 'none',
      apiProvider: 'firstParty',
      email: 'do-not-copy',
    }),
  }))
  const service = new ClaudeCredentialHealthService({
    run,
    baseEnv: {
      HOME: '/fixture',
      PATH: '/bin',
      ANTHROPIC_API_KEY: 'secret-fixture',
      CLAUDE_CODE_OAUTH_TOKEN: 'secret-fixture',
    },
  })
  service.setBinaryPath('/fixture/claude')
  expect(await service.inspect(account)).toBe('absent')
  expect(run).toHaveBeenCalledWith({
    command: '/fixture/claude',
    args: ['auth', 'status'],
    cwd: tmpdir(),
    env: expect.objectContaining({
      CLAUDE_CONFIG_DIR: '/fixture/config',
      CLAUDE_SECURESTORAGE_CONFIG_DIR: '/fixture/credential',
    }),
  })
  expect(run.mock.calls[0][0].env).not.toHaveProperty('ANTHROPIC_API_KEY')
  expect(run.mock.calls[0][0].env).not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN')
})

it('probes from a neutral cwd: never the account config/credential dir, nor inside or above either', async () => {
  const run = vi.fn(async (_command: ProviderAccountCommand) => ({
    code: 0,
    stdout: JSON.stringify({
      loggedIn: true,
      authMethod: 'oauth_token',
      apiProvider: 'firstParty',
    }),
  }))
  const service = new ClaudeCredentialHealthService({ run, baseEnv: {} })
  service.setBinaryPath('/fixture/claude')
  await service.inspect(account)
  const cwd = run.mock.calls[0][0].cwd
  expect(cwd).toBeTruthy()
  for (const owned of [account.configDir, account.credentialDir]) {
    // not the directory itself, not inside it, and not above it either —
    // a cwd above the config dir would let the CLI walk into it.
    expect(cwd).not.toBe(owned)
    expect(cwd?.startsWith(owned + sep)).toBe(false)
    expect(owned.startsWith(String(cwd) + sep)).toBe(false)
  }
})

it('does not probe a non-local row, missing binary or a different provider', async () => {
  const run = vi.fn()
  const service = new ClaudeCredentialHealthService({ run })
  expect(await service.inspect(account)).toBe('unknown')
  service.setBinaryPath('/fixture/claude')
  expect(await service.inspect({ ...account, executionHostId: 'remote' })).toBe(
    'unknown',
  )
  expect(await service.inspect({ ...account, providerId: 'codex' })).toBe(
    'unknown',
  )
  expect(await service.inspect({ ...account, credentialDir: '' })).toBe(
    'unknown',
  )
  expect(await service.inspect({ ...account, configDir: '' })).toBe('unknown')
  expect(run).not.toHaveBeenCalled()
})

it('classifies command failures without including their output', async () => {
  const run = vi.fn(async () => {
    throw new Error('secret-fixture')
  })
  const service = new ClaudeCredentialHealthService({ run })
  service.setBinaryPath('/fixture/claude')
  expect(await service.inspect(account)).toBe('unknown')
})
