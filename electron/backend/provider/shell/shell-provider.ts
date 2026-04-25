import type {
  Provider,
  ProviderDescriptor,
  SessionHandle,
} from '../provider.types'

const SHELL_DESCRIPTOR: ProviderDescriptor = {
  id: 'shell',
  name: 'Shell',
  vendorLabel: 'Local',
  kind: 'shell',
  supportsContinuation: false,
  defaultModelId: '',
  fastModelId: null,
  modelOptions: [],
  attachments: {
    supportsImage: false,
    supportsPdf: false,
    supportsText: false,
    maxImageBytes: 0,
    maxPdfBytes: 0,
    maxTextBytes: 0,
    maxTotalBytes: 0,
  },
  skills: {
    catalog: 'unsupported',
    invocation: 'unsupported',
    activationConfirmation: 'none',
  },
}

function noopHandle(): SessionHandle {
  return {
    onDelta: () => {},
    onStatusChange: () => {},
    onAttentionChange: () => {},
    onContinuationToken: () => {},
    onContextWindowChange: () => {},
    onActivityChange: () => {},
    sendMessage: () => {
      throw new Error('Shell provider does not support sendMessage')
    },
    approve: () => {},
    deny: () => {},
    stop: () => {},
  }
}

export class ShellProvider implements Provider {
  id = 'shell'
  name = 'Shell'
  supportsContinuation = false

  describe(): Promise<ProviderDescriptor> {
    return Promise.resolve(SHELL_DESCRIPTOR)
  }

  start(): SessionHandle {
    return noopHandle()
  }
}
