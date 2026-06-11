import { describe, expect, it } from 'vitest'
import { ProviderRegistry } from '../provider-registry'
import type { Provider, ProviderDescriptor } from '../provider.types'
import { describeProviderExecutionHostContract } from './execution-host.contract'
import { LocalExecutionHost } from './local-execution-host'

function createFakeProvider(input: {
  id: string
  supportsContinuation: boolean
  supportsOneShot: boolean
}): Provider {
  const descriptor: ProviderDescriptor = {
    id: input.id,
    name: `Fake ${input.id}`,
    vendorLabel: 'Fake',
    kind: 'conversation',
    supportsContinuation: input.supportsContinuation,
    defaultModelId: 'test-model',
    modelOptions: [
      {
        id: 'test-model',
        label: 'Test Model',
        defaultEffort: null,
        effortOptions: [],
      },
    ],
    attachments: {
      supportsImage: false,
      supportsPdf: false,
      supportsText: false,
      maxImageBytes: 0,
      maxPdfBytes: 0,
      maxTextBytes: 0,
      maxTotalBytes: 0,
    },
    midRunInput: {
      supportsAnswer: false,
      supportsNativeFollowUp: false,
      supportsAppQueuedFollowUp: false,
      supportsSteer: false,
      supportsInterrupt: false,
      defaultRunningMode: null,
    },
  }

  return {
    id: input.id,
    name: descriptor.name,
    supportsContinuation: input.supportsContinuation,
    describe: async () => descriptor,
    start: () => ({
      onDelta: () => {},
      onStatusChange: () => {},
      onAttentionChange: () => {},
      onContinuationToken: () => {},
      onContextWindowChange: () => {},
      onActivityChange: () => {},
      sendMessage: () => {},
      approve: () => {},
      deny: () => {},
      stop: () => {},
    }),
    ...(input.supportsOneShot
      ? { oneShot: async () => ({ text: 'one-shot result' }) }
      : {}),
  }
}

function createHostContext() {
  const registry = new ProviderRegistry()
  registry.register(
    createFakeProvider({
      id: 'fake-full',
      supportsContinuation: true,
      supportsOneShot: true,
    }),
  )
  registry.register(
    createFakeProvider({
      id: 'fake-no-oneshot',
      supportsContinuation: false,
      supportsOneShot: false,
    }),
  )
  return { registry, host: new LocalExecutionHost(registry) }
}

describeProviderExecutionHostContract('LocalExecutionHost', () => ({
  ...createHostContext(),
  fullProviderId: 'fake-full',
  noOneShotProviderId: 'fake-no-oneshot',
  unknownProviderId: 'nope',
}))

describe('LocalExecutionHost', () => {
  it('reflects providers registered after construction', () => {
    const registry = new ProviderRegistry()
    const host = new LocalExecutionHost(registry)
    expect(host.capabilitiesFor('late')).toBeNull()

    registry.register(
      createFakeProvider({
        id: 'late',
        supportsContinuation: false,
        supportsOneShot: false,
      }),
    )
    expect(host.capabilitiesFor('late')).toMatchObject({
      providerId: 'late',
      supportsContinuation: false,
      supportsOneShot: false,
    })
  })
})
