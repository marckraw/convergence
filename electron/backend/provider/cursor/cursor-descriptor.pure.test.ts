import { describe, expect, it } from 'vitest'
import { buildCursorDescriptorFromSession } from './cursor-descriptor.pure'

const SESSION_NEW_RESULT = {
  sessionId: 'cursor-session-1',
  configOptions: [
    {
      id: 'mode',
      currentValue: 'agent',
      options: [
        { value: 'agent', label: 'Agent' },
        { value: 'plan', label: 'Plan' },
      ],
    },
    {
      id: 'model',
      currentValue: 'composer-2.5[fast=true]',
      options: [
        { value: 'default[]', label: 'Auto' },
        { value: 'composer-2.5[fast=true]', label: 'Composer 2.5 Fast' },
      ],
    },
  ],
}

describe('cursor descriptor mapping', () => {
  it('builds a provider descriptor from Cursor ACP session config options', () => {
    const descriptor = buildCursorDescriptorFromSession(SESSION_NEW_RESULT)

    expect(descriptor).toMatchObject({
      id: 'cursor',
      name: 'Cursor',
      vendorLabel: 'Anysphere',
      defaultModelId: 'composer-2.5[fast=true]',
      supportsContinuation: true,
      attachments: {
        supportsImage: true,
        supportsPdf: false,
        supportsText: true,
      },
    })
    expect(descriptor.modelOptions).toEqual([
      {
        id: 'default[]',
        label: 'Auto',
        defaultEffort: null,
        effortOptions: [],
        inputModalities: ['text', 'image'],
        source: 'provider',
      },
      {
        id: 'composer-2.5[fast=true]',
        label: 'Composer 2.5 Fast',
        description: 'fast',
        defaultEffort: null,
        effortOptions: [],
        inputModalities: ['text', 'image'],
        source: 'provider',
      },
    ])
    expect(descriptor.configOptions).toEqual([
      expect.objectContaining({
        id: 'mode',
        currentValue: 'agent',
        method: 'session/set_mode',
      }),
      expect.objectContaining({
        id: 'model',
        currentValue: 'composer-2.5[fast=true]',
        method: 'session/set_config_option',
      }),
    ])
    expect(descriptor.telemetry).toMatchObject({
      contextWindow: { availability: 'partial', source: 'model-metadata' },
      quota: { availability: 'unavailable', source: 'manual' },
    })
    expect(descriptor.settings?.links?.[0]).toEqual({
      label: 'Cursor dashboard',
      url: 'https://cursor.com/dashboard',
    })
  })

  it('falls back to the conservative Cursor descriptor when no models are advertised', () => {
    const descriptor = buildCursorDescriptorFromSession({ sessionId: 's1' })

    expect(descriptor.defaultModelId).toBe('default[]')
    expect(descriptor.modelOptions).toHaveLength(1)
    expect(descriptor.modelOptions[0]?.id).toBe('default[]')
  })
})
