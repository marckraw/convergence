import { describe, expect, it, vi } from 'vitest'
import { CursorSkillsService } from './cursor-skills.service'

describe('CursorSkillsService', () => {
  it('maps Cursor ACP available commands into a provider skill catalog', async () => {
    const listAvailableCommands = vi.fn(async () => ({
      notifications: [
        {
          method: 'session/update',
          params: {
            update: {
              sessionUpdate: 'available_commands_update',
              availableCommands: [
                {
                  name: 'review',
                  description: 'Review current changes',
                },
              ],
            },
          },
        },
      ],
    }))
    const service = new CursorSkillsService('agent', { listAvailableCommands })

    await expect(
      service.list('/repo', { forceReload: true }),
    ).resolves.toMatchObject({
      providerId: 'cursor',
      providerName: 'Cursor',
      catalogSource: 'native-rpc',
      invocationSupport: 'native-command',
      activationConfirmation: 'none',
      skills: [
        {
          providerId: 'cursor',
          name: 'review',
          description: 'Review current changes',
          sourceLabel: 'Cursor command',
        },
      ],
      error: null,
    })
    expect(listAvailableCommands).toHaveBeenCalledWith('/repo', {
      forceReload: true,
    })
  })

  it('returns a Cursor provider error catalog when discovery fails', async () => {
    const service = new CursorSkillsService('agent', {
      listAvailableCommands: async () => {
        throw new Error('agent acp failed')
      },
    })

    await expect(service.list('/repo')).resolves.toEqual({
      providerId: 'cursor',
      providerName: 'Cursor',
      catalogSource: 'native-rpc',
      invocationSupport: 'native-command',
      activationConfirmation: 'none',
      skills: [],
      error: 'agent acp failed',
    })
  })
})
