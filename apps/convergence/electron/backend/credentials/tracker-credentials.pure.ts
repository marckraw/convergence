import {
  addGenericPasswordCommand,
  keychainPasswordHex,
} from './execution-host-daemon-credentials.pure'

/**
 * The deterministic half of the tracker key's Keychain door (MAR-3084 R3).
 *
 * Mirrors the daemon credentials (MAR-2642) through that file's own pure
 * builders: the key travels hex-encoded through `security -i`'s stdin, never
 * in argv, and every token of the command is quoted.
 */
export const TRACKER_KEYCHAIN_SERVICE = 'convergence.tracker'

export type { TrackerCredentialStatus } from '../../../src/shared/types/tracker.types'

/** The stdin line that stores a crew's key. */
export function addTrackerKeyCommand(input: {
  crewId: string
  apiKey: string
}): { stdin: string; passwordHex: string } {
  const passwordHex = keychainPasswordHex(input.apiKey)
  return {
    passwordHex,
    stdin: addGenericPasswordCommand({
      account: input.crewId,
      service: TRACKER_KEYCHAIN_SERVICE,
      passwordHex,
    }),
  }
}

/** argv for reading a crew's key back (main process only). */
export function findTrackerKeyArgs(crewId: string): string[] {
  return [
    'find-generic-password',
    '-a',
    crewId,
    '-s',
    TRACKER_KEYCHAIN_SERVICE,
    '-w',
  ]
}

/** argv for forgetting a crew's key. */
export function deleteTrackerKeyArgs(crewId: string): string[] {
  return [
    'delete-generic-password',
    '-a',
    crewId,
    '-s',
    TRACKER_KEYCHAIN_SERVICE,
  ]
}
