import { readCapturedDaemonHandshake } from './captured-daemon-handshake.pure'

export interface ConnectionReading {
  status: 'connected' | 'unauthorized' | 'incompatible' | 'unreachable'
  endpointName: string
}

const CAPTURED_ENDPOINT_NAME = 'backpack.automations'

/**
 * Adapter boundary: S1 evaluates recorded health, never a network connection.
 * S2 replaces this implementation with the live handshake without changing screens.
 * The optional fixture switch belongs only to the developer route.
 */
export function readConnection(unreachable = false): ConnectionReading {
  return {
    status: readCapturedDaemonHandshake(unreachable).status,
    endpointName: CAPTURED_ENDPOINT_NAME,
  }
}
