import { expect, it, vi } from 'vitest'
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
    cwd: '/fixture/config',
    env: expect.objectContaining({
      CLAUDE_CONFIG_DIR: '/fixture/config',
      CLAUDE_SECURESTORAGE_CONFIG_DIR: '/fixture/credential',
    }),
  })
  expect(run.mock.calls[0][0].env).not.toHaveProperty('ANTHROPIC_API_KEY')
  expect(run.mock.calls[0][0].env).not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN')
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
