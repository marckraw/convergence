import { describe, expect, it, vi } from 'vitest'
import {
  SecurityCommandError,
  TrackerCredentialsService,
  type SecurityRunner,
} from './tracker-credentials.service'

const KEY = 'lin_api_fixture_value'

function keychain() {
  const store = new Map<string, string>()
  const run = vi.fn<SecurityRunner>(async ({ args, stdin }) => {
    if (args[0] === '-i') {
      const account = /-a" "([^"]+)"/.exec(stdin ?? '')?.[1] ?? ''
      const hex = /-X" "([0-9a-f]+)"/.exec(stdin ?? '')?.[1] ?? ''
      store.set(account, Buffer.from(hex, 'hex').toString('utf8'))
      return ''
    }
    const account = args[2]!
    if (args[0] === 'find-generic-password') {
      const value = store.get(account)
      if (value === undefined) throw new SecurityCommandError('not found', 44)
      return value
    }
    if (args[0] === 'delete-generic-password') {
      if (!store.delete(account))
        throw new SecurityCommandError('not found', 44)
      return ''
    }
    throw new Error(`unexpected ${args[0]}`)
  })
  return { run, store }
}

describe('MAR-3084 R3: the key is a Keychain fact', () => {
  it('status reports present or absent, never the value', async () => {
    const { run, store } = keychain()
    const service = new TrackerCredentialsService({ run, platform: 'darwin' })

    await expect(service.status('crew-1')).resolves.toBe('absent')
    await expect(service.setKey('crew-1', ` ${KEY} `)).resolves.toBe('present')
    expect(store.get('crew-1')).toBe(KEY)
    expect(
      JSON.stringify(run.mock.calls.map(([call]) => call.args)),
    ).not.toContain(KEY)
    await expect(service.resolveKey('crew-1')).resolves.toBe(KEY)
    await expect(service.deleteKey('crew-1')).resolves.toBe('absent')
    await expect(service.deleteKey('crew-1')).resolves.toBe('absent')
  })

  it('refuses an empty key and a non-macOS store', async () => {
    const { run } = keychain()
    await expect(
      new TrackerCredentialsService({ run, platform: 'darwin' }).setKey(
        'c',
        ' ',
      ),
    ).rejects.toThrow('cannot be empty')
    await expect(
      new TrackerCredentialsService({ run, platform: 'linux' }).setKey(
        'c',
        KEY,
      ),
    ).rejects.toThrow('only available on macOS')
  })

  it('a delete that fails for another reason is not read as success', async () => {
    const run = vi.fn<SecurityRunner>(async () => {
      throw new SecurityCommandError('locked', 36)
    })
    await expect(
      new TrackerCredentialsService({ run, platform: 'darwin' }).deleteKey('c'),
    ).rejects.toThrow('locked')
  })
})
