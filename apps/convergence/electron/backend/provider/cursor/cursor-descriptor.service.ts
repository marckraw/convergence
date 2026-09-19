import type { ProviderDescriptor } from '../provider.types'
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

/**
 * Probes the model list over a disposable ACP session. It rejects on failure on
 * purpose: `CursorProvider.describe()` owns what a failed probe means, so that
 * no caller can quietly cache a fallback as the truth (MAR-3145 R3).
 */
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
