import { describe, expect, it } from 'vitest'
import { fetchCursorAcpDescriptor } from './cursor-descriptor.service'

describe('cursor descriptor service', () => {
  it('fetches a dynamic descriptor from a disposable ACP session', async () => {
    const descriptor = await fetchCursorAcpDescriptor('agent', '/repo', {
      client: {
        createSession: async () => ({
          sessionId: 's1',
          configOptions: [
            {
              id: 'model',
              currentValue: 'default[]',
              options: [{ value: 'default[]', label: 'Auto' }],
            },
          ],
        }),
      },
    })

    expect(descriptor.id).toBe('cursor')
    expect(descriptor.defaultModelId).toBe('default[]')
    expect(descriptor.modelOptions[0]?.label).toBe('Auto')
  })

  // A failed probe is the caller's news, not a fallback the service invents:
  // `describe()` has to know it failed to log it and to retry (MAR-3145 R3).
  it('rejects when dynamic discovery fails', async () => {
    await expect(
      fetchCursorAcpDescriptor('agent', '/repo', {
        client: {
          createSession: async () => {
            throw new Error('not installed')
          },
        },
      }),
    ).rejects.toThrow('not installed')
  })
})
