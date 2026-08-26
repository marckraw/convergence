import { afterEach, describe, expect, it } from 'vitest'
import {
  EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY,
  ExecutionHostDaemonCredentialsService,
} from './execution-host-daemon-credentials.service'

describe('ExecutionHostDaemonCredentialsService', () => {
  const previous = process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY]

  afterEach(() => {
    if (previous === undefined) {
      delete process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY]
    } else {
      process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY] = previous
    }
  })

  // MAR-2620: the environment override predates Endpoints and names no
  // machine. If it answered for every Endpoint, adding a second daemon would
  // hand it the first one's token — a turn authenticating as a machine it was
  // never given credentials for, with nothing downstream able to notice.
  it('lets the environment token serve only the endpoint the single-host era became', async () => {
    process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY] = 'env-token'
    const service = new ExecutionHostDaemonCredentialsService()

    expect(await service.resolveToken('default')).toBe('env-token')
    expect(await service.resolveToken('daemon-b')).not.toBe('env-token')

    const status = await service.getStatus('default')
    expect(status).toMatchObject({ configured: true, source: 'environment' })
  })
})
