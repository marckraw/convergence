import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSkillStore } from './skill.model'

const listProviderIds = vi.fn()
const listProvider = vi.fn()

/**
 * A scan that throws is recorded, not dropped (MAR-3393 R3): "no skills" and
 * "could not read them" used to be the same catalog.
 */
describe('useSkillStore.loadCatalog failed providers', () => {
  beforeEach(() => {
    useSkillStore.getState().reset()
    listProviderIds.mockReset()
    listProvider.mockReset()
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      skills: { listProviderIds, listProvider },
    }
    listProviderIds.mockResolvedValue({
      projectId: 'project-1',
      projectName: 'Project',
      providers: [
        { providerId: 'claude-code', providerName: 'Claude Code' },
        { providerId: 'codex', providerName: 'Codex' },
      ],
    })
  })

  it('records the provider whose scan threw, with its message, and keeps the others', async () => {
    listProvider.mockImplementation((_projectId: string, providerId: string) =>
      providerId === 'codex'
        ? Promise.reject(new Error('Codex app-server exited'))
        : Promise.resolve({
            providerId: 'claude-code',
            providerName: 'Claude Code',
            catalogSource: 'filesystem',
            invocationSupport: 'native-command',
            activationConfirmation: 'none',
            skills: [],
            error: null,
          }),
    )

    await useSkillStore.getState().loadCatalog('project-1')

    const state = useSkillStore.getState()
    expect(state.failedProviders).toEqual({ codex: 'Codex app-server exited' })
    expect(state.catalog?.providers).toEqual([])
    expect(state.isCatalogLoading).toBe(false)
  })

  it('forgets an old failure when the next load starts', async () => {
    useSkillStore.setState({ failedProviders: { codex: 'old' } })
    listProvider.mockResolvedValue(null)

    await useSkillStore.getState().loadCatalog('project-1')

    expect(useSkillStore.getState().failedProviders).toEqual({})
  })
})
