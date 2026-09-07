import { afterEach, expect, it, vi } from 'vitest'
import { readConnection } from './connection.api'

afterEach(() => {
  delete window.backpackStudio
})

it('reads the evaluated live handshake through preload — mutation: read the captured fixture', async () => {
  const getDaemonStatus = vi.fn(async () => ({
    status: 'unauthorized',
    endpointName: 'live.example',
    headline: 'Refused',
    daemonVersion: 'live',
    apiVersion: '0',
    capabilities: [],
  }))
  Object.defineProperty(window, 'backpackStudio', {
    configurable: true,
    value: { getDaemonStatus },
  })
  expect(await readConnection()).toMatchObject({
    status: 'unauthorized',
    endpointName: 'live.example',
  })
  expect(getDaemonStatus).toHaveBeenCalledOnce()
})
