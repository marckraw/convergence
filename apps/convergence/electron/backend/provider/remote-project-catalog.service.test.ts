import { describe, expect, it } from 'vitest'
import { EXECUTION_HOST_REQUEST_CASES } from '../../../src/shared/lib/execution-host-id.fixture'
import { RemoteProjectCatalogService } from './remote-project-catalog.service'
import type { RemoteProjectCatalog } from './execution-host/remote-project.types'

const PROJECTS = [
  {
    id: 'new-blok',
    name: 'new-blok',
    workingDirectory: '/srv/projects/new-blok',
    origin: 'https://github.com/marckraw/new-blok.git',
  },
]

function build(
  overrides: {
    endpoints?: string[]
    catalogs?: Record<string, Omit<RemoteProjectCatalog, 'executionHostId'>>
    withRemote?: boolean
  } = {},
) {
  const asked: string[] = []
  const service = new RemoteProjectCatalogService({
    remote:
      overrides.withRemote === false
        ? undefined
        : {
            listEndpointIds: async () => overrides.endpoints ?? ['daemon-a'],
            hostFor: (endpointId) => ({
              describeProjectCatalog: async () => {
                asked.push(endpointId)
                return (
                  overrides.catalogs?.[endpointId] ?? {
                    supported: true,
                    projects: PROJECTS,
                    unreachableReason: null,
                  }
                )
              },
            }),
          },
  })
  return { service, asked }
}

describe('RemoteProjectCatalogService', () => {
  it('answers for this machine without asking anything, and calls it no failure', async () => {
    const { service, asked } = build()
    await expect(service.get('local')).resolves.toEqual({
      executionHostId: 'local',
      supported: false,
      projects: [],
      unreachableReason: null,
    })
    expect(asked).toEqual([])
  })

  it('reads an id exactly as the provider catalog door reads it', async () => {
    for (const testCase of EXECUTION_HOST_REQUEST_CASES) {
      const { service, asked } = build({ endpoints: ['daemon-a'] })
      const catalog = await service.get(testCase.id)
      if (testCase.thisMachine) {
        expect(catalog.executionHostId, testCase.why).toBe('local')
        expect(catalog.unreachableReason, testCase.why).toBeNull()
        expect(asked, testCase.why).toEqual([])
      } else {
        expect(catalog.executionHostId, testCase.why).toBe(testCase.id)
      }
    }
  })

  it('refuses an id that is not a string, naming what arrived', async () => {
    const { service, asked } = build()
    const catalog = await service.get(42)
    expect(catalog.unreachableReason).toContain('a number (42)')
    expect(asked).toEqual([])
  })

  it('refuses an id no Endpoint is configured for, saying so', async () => {
    const { service, asked } = build({ endpoints: ['daemon-b'] })
    const catalog = await service.get('daemon-a')
    expect(catalog.executionHostId).toBe('daemon-a')
    expect(catalog.projects).toEqual([])
    expect(catalog.unreachableReason).toContain('is not configured')
    expect(asked).toEqual([])
  })

  it('lists the Projects of the machine that was asked, echoing which one', async () => {
    const { service, asked } = build({ endpoints: ['daemon-a', 'daemon-b'] })
    await expect(service.get('daemon-b')).resolves.toEqual({
      executionHostId: 'daemon-b',
      supported: true,
      projects: PROJECTS,
      unreachableReason: null,
    })
    expect(asked).toEqual(['daemon-b'])
  })

  it('carries through a machine that offers no Projects without calling it an error', async () => {
    const { service } = build({
      catalogs: {
        'daemon-a': {
          supported: false,
          projects: [],
          unreachableReason: null,
        },
      },
    })
    const catalog = await service.get('daemon-a')
    expect(catalog.supported).toBe(false)
    expect(catalog.unreachableReason).toBeNull()
  })

  it('says remote execution is unavailable rather than answering for this machine', async () => {
    const { service } = build({ withRemote: false })
    const catalog = await service.get('daemon-a')
    expect(catalog.executionHostId).toBe('daemon-a')
    expect(catalog.unreachableReason).toContain('not available')
  })
})
