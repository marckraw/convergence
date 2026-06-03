import {
  buildFallbackCursorDescriptor,
  normalizeProviderDescriptor,
} from '../provider-descriptor.pure'
import type { ProviderDescriptor, ProviderModelOption } from '../provider.types'
import {
  getCursorAcpDefaultModelId,
  normalizeCursorAcpModelOptions,
  normalizeCursorAcpProviderConfigOptions,
  CURSOR_ACP_SETTINGS_INFO,
  CURSOR_ACP_TELEMETRY_CAPABILITY,
} from './cursor-acp-contract.pure'

export function buildCursorDescriptorFromSession(
  sessionResult: unknown,
): ProviderDescriptor {
  const fallback = buildFallbackCursorDescriptor()
  const discoveredModelOptions = normalizeCursorAcpModelOptions(sessionResult)

  if (discoveredModelOptions.length === 0) {
    return normalizeProviderDescriptor(fallback)
  }

  return normalizeProviderDescriptor({
    ...fallback,
    defaultModelId: getCursorAcpDefaultModelId(sessionResult),
    modelOptions: discoveredModelOptions.map(enableImageInput),
    configOptions: normalizeCursorAcpProviderConfigOptions(sessionResult),
    telemetry: CURSOR_ACP_TELEMETRY_CAPABILITY,
    settings: CURSOR_ACP_SETTINGS_INFO,
  })
}

function enableImageInput(option: ProviderModelOption): ProviderModelOption {
  const inputModalities = option.inputModalities ?? ['text']
  return inputModalities.includes('image')
    ? option
    : {
        ...option,
        inputModalities: [...inputModalities, 'image'],
      }
}
