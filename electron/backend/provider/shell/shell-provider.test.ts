import { describe, expect, it } from 'vitest'
import { ShellProvider } from './shell-provider'

describe('ShellProvider', () => {
  it('exposes a shell-kind descriptor with no models', async () => {
    const provider = new ShellProvider()
    const descriptor = await provider.describe()

    expect(descriptor.id).toBe('shell')
    expect(descriptor.kind).toBe('shell')
    expect(descriptor.supportsContinuation).toBe(false)
    expect(descriptor.modelOptions).toEqual([])
    expect(descriptor.attachments.supportsImage).toBe(false)
    expect(descriptor.attachments.supportsPdf).toBe(false)
    expect(descriptor.attachments.supportsText).toBe(false)
  })

  it('start returns a no-op handle whose sendMessage throws', () => {
    const provider = new ShellProvider()
    const handle = provider.start()

    expect(() => handle.sendMessage('hi')).toThrow(
      /Shell provider does not support sendMessage/,
    )

    expect(() => handle.approve()).not.toThrow()
    expect(() => handle.deny()).not.toThrow()
    expect(() => handle.stop()).not.toThrow()
  })

  it('does not implement oneShot', () => {
    const provider = new ShellProvider()
    expect(
      (provider as unknown as { oneShot?: unknown }).oneShot,
    ).toBeUndefined()
  })
})
