import { describe, expect, it } from 'vitest'
import { parseSecurityCommands } from './execution-host-daemon-credentials.fixture'
import {
  addTrackerKeyCommand,
  deleteTrackerKeyArgs,
  findTrackerKeyArgs,
  TRACKER_KEYCHAIN_SERVICE,
} from './tracker-credentials.pure'

describe('MAR-3084 R3: the tracker key command lines', () => {
  it('stores the key hex-encoded under convergence.tracker / crew id, on stdin only', () => {
    const key = 'lin_api_fixture "with" a\nnewline'
    const command = addTrackerKeyCommand({ crewId: 'crew-1', apiKey: key })

    expect(TRACKER_KEYCHAIN_SERVICE).toBe('convergence.tracker')
    expect(command.passwordHex).toBe(Buffer.from(key, 'utf8').toString('hex'))
    expect(parseSecurityCommands(command.stdin)).toEqual([
      [
        'add-generic-password',
        '-a',
        'crew-1',
        '-s',
        'convergence.tracker',
        '-U',
        '-X',
        command.passwordHex,
      ],
    ])
    expect(command.stdin).not.toContain('lin_api_fixture')
  })

  it('reads and deletes by the same account and service', () => {
    expect(findTrackerKeyArgs('crew-1')).toEqual([
      'find-generic-password',
      '-a',
      'crew-1',
      '-s',
      'convergence.tracker',
      '-w',
    ])
    expect(deleteTrackerKeyArgs('crew-1')).toEqual([
      'delete-generic-password',
      '-a',
      'crew-1',
      '-s',
      'convergence.tracker',
    ])
  })
})
