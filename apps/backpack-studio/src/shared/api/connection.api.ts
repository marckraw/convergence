import {
  readCapturedDaemonHandshake,
  type StudioHandshakeReading,
} from './captured-daemon-handshake.pure'
import type { DaemonStatusView } from './studio-api.types'

export interface ConnectionReading extends StudioHandshakeReading {
  endpointName: string
}

export const pendingConnection: ConnectionReading = {
  status: 'unreachable',
  endpointName: 'remote assistant',
  headline: 'Waiting for the daemon handshake.',
  daemonVersion: 'unknown',
  apiVersion: 'unknown',
  capabilities: [],
}

export function connectionFromDaemon(
  daemon: DaemonStatusView | null,
): ConnectionReading {
  if (!daemon) return pendingConnection
  return {
    status: daemon.status,
    endpointName: daemon.endpointName ?? 'remote assistant',
    headline: daemon.headline,
    daemonVersion: daemon.daemonVersion ?? 'unknown',
    apiVersion: daemon.apiVersion ?? 'unknown',
    capabilities: daemon.capabilities ?? [],
  }
}

/** The one connection door: the evaluated main-process handshake via studio:daemon-status. */
export async function readConnection(): Promise<ConnectionReading> {
  const bridge = window.backpackStudio
  if (!bridge)
    return {
      ...pendingConnection,
      headline: 'The Studio connection bridge is unavailable.',
    }
  return connectionFromDaemon(await bridge.getDaemonStatus())
}

/** The developer simulation uses the captured evaluator and retains the live endpoint name. */
export function simulateUnreachable(
  connection: ConnectionReading,
): ConnectionReading {
  return {
    ...readCapturedDaemonHandshake(true),
    endpointName: connection.endpointName,
  }
}
