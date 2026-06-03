import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProviderInfo } from '@/entities/session'
import { ProviderSettingsMetadata } from './provider-settings-metadata.presentational'

const cursorProvider: ProviderInfo = {
  id: 'cursor',
  name: 'Cursor',
  vendorLabel: 'Anysphere',
  kind: 'conversation',
  supportsContinuation: true,
  defaultModelId: 'default[]',
  modelOptions: [],
  attachments: {
    supportsImage: true,
    supportsPdf: false,
    supportsText: true,
    maxImageBytes: 10 * 1024 * 1024,
    maxPdfBytes: 0,
    maxTextBytes: 1024 * 1024,
    maxTotalBytes: 50 * 1024 * 1024,
  },
  midRunInput: {
    supportsAnswer: true,
    supportsNativeFollowUp: false,
    supportsAppQueuedFollowUp: true,
    supportsSteer: false,
    supportsInterrupt: false,
    defaultRunningMode: 'follow-up',
  },
  configOptions: [
    {
      id: 'mode',
      label: 'Mode',
      currentValue: 'agent',
      source: 'provider',
      persistence: 'session',
      method: 'session/set_mode',
      options: [
        { id: 'agent', label: 'Agent' },
        { id: 'plan', label: 'Plan' },
      ],
    },
  ],
  telemetry: {
    contextWindow: {
      availability: 'partial',
      source: 'model-metadata',
    },
    quota: {
      availability: 'unavailable',
      source: 'manual',
      usageUrl: 'https://cursor.com/dashboard',
    },
  },
  settings: {
    help: [
      {
        label: 'Usage',
        value: 'Cursor ACP does not report quota windows.',
      },
    ],
    links: [{ label: 'Cursor dashboard', url: 'https://cursor.com/dashboard' }],
  },
}

describe('ProviderSettingsMetadata', () => {
  it('renders provider-reported config, telemetry, and help metadata', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    render(<ProviderSettingsMetadata provider={cursorProvider} />)

    expect(screen.getByText('Cursor behavior')).toBeInTheDocument()
    expect(screen.getByText('Mode')).toBeInTheDocument()
    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(screen.getByText('Context window')).toBeInTheDocument()
    expect(screen.getByText('Partial')).toBeInTheDocument()
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(
      screen.getByText('Cursor ACP does not report quota windows.'),
    ).toBeInTheDocument()

    screen.getByRole('button', { name: 'Cursor dashboard' }).click()
    expect(openSpy).toHaveBeenCalledWith(
      'https://cursor.com/dashboard',
      '_blank',
    )
    openSpy.mockRestore()
  })
})
