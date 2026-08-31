import { describe, expect, it } from 'vitest'
import {
  fetchCursorAcpDescriptor,
  fetchCursorAcpDescriptorOrFallback,
} from './cursor-descriptor.service'

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

  it('returns fallback descriptor when dynamic discovery fails', async () => {
    const descriptor = await fetchCursorAcpDescriptorOrFallback(
      'agent',
      '/repo',
      {
        client: {
          createSession: async () => {
            throw new Error('not installed')
          },
        },
      },
    )

    expect(descriptor.id).toBe('cursor')
    expect(descriptor.defaultModelId).toBe('default[]')
    expect(descriptor.modelOptions[0]?.label).toBe('Auto')
  })
})
