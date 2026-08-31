import type { ProviderDescriptor } from './provider.types'

export function isConversationalProvider(
  descriptor: Pick<ProviderDescriptor, 'kind'>,
): boolean {
  return descriptor.kind === 'conversation'
}
