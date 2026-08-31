import type { ProviderDescriptor } from '../provider.types'
import { buildFallbackCursorDescriptor } from '../provider-descriptor.pure'
import {
  CursorAcpProcessClient,
  type CursorAcpProcessClientOptions,
} from './cursor-acp-client'
import { buildCursorDescriptorFromSession } from './cursor-descriptor.pure'

export interface CursorAcpSessionDiscoveryClient {
  createSession(cwd: string): Promise<unknown>
}

export interface CursorAcpDescriptorServiceOptions extends CursorAcpProcessClientOptions {
  client?: CursorAcpSessionDiscoveryClient
}

export async function fetchCursorAcpDescriptor(
  binaryPath: string,
  cwd: string = process.cwd(),
  options: CursorAcpDescriptorServiceOptions = {},
): Promise<ProviderDescriptor> {
  const { client, ...clientOptions } = options
  const discoveryClient =
    client ?? new CursorAcpProcessClient(binaryPath, clientOptions)
  const sessionResult = await discoveryClient.createSession(cwd)
  return buildCursorDescriptorFromSession(sessionResult)
}

export async function fetchCursorAcpDescriptorOrFallback(
  binaryPath: string,
  cwd: string = process.cwd(),
  options: CursorAcpDescriptorServiceOptions = {},
): Promise<ProviderDescriptor> {
  try {
    return await fetchCursorAcpDescriptor(binaryPath, cwd, options)
  } catch {
    return buildFallbackCursorDescriptor()
  }
}
