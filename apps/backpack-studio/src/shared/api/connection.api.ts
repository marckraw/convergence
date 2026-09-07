import {
  readCapturedDaemonHandshake,
  type StudioHandshakeReading,
} from './captured-daemon-handshake.pure'

export interface ConnectionReading extends StudioHandshakeReading {
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
    ...readCapturedDaemonHandshake(unreachable),
    endpointName: CAPTURED_ENDPOINT_NAME,
  }
}
