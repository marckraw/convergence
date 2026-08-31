import { describe, expect, it } from 'vitest'
import {
  catalogInForce,
  providerCatalogSourceForHost,
} from './provider-catalog.pure'
import {
  landedRemoteProjectCatalog,
  remoteProjectMatchingOrigin,
  type RemoteProject,
  type RemoteProjectCatalogs,
} from './remote-project-catalog.pure'
import type { ExecutionHostEndpoint } from '@/entities/execution-host'

function endpoint(id: string, baseUrl: string): ExecutionHostEndpoint {
  return {
    id,
    label: id,
    baseUrl,
    position: 0,
    createdAt: '2026-08-28',
    updatedAt: '2026-08-28',
    configurationEpoch: 0,
  }
}

function project(overrides: Partial<RemoteProject> = {}): RemoteProject {
  return {
    id: 'new-blok',
    name: 'new-blok',
    workingDirectory: '/srv/projects/new-blok',
    origin: 'https://github.com/marckraw/new-blok.git',
    ...overrides,
  }
}

describe('remoteProjectMatchingOrigin', () => {
  it('matches two spellings of one repository', () => {
    expect(
      remoteProjectMatchingOrigin(
        [project({ origin: 'https://github.com/marckraw/new-blok' })],
        'git@github.com:marckraw/new-blok.git',
      )?.id,
    ).toBe('new-blok')
  })

  it('matches an ssh URL against an https one', () => {
    expect(
      remoteProjectMatchingOrigin(
        [project({ origin: 'ssh://git@github.com/marckraw/new-blok.git' })],
        'https://github.com/marckraw/new-blok.git',
      )?.id,
    ).toBe('new-blok')
  })

  it('matches nothing when the Projects carry no origin yet', () => {
    expect(
      remoteProjectMatchingOrigin(
        [project({ origin: null })],
        'https://github.com/marckraw/new-blok.git',
      ),
    ).toBeNull()
  })

  it('matches nothing when this project has no origin a daemon could clone', () => {
    expect(remoteProjectMatchingOrigin([project()], null)).toBeNull()
    expect(
      remoteProjectMatchingOrigin([project()], '/tmp/not-a-remote'),
    ).toBeNull()
  })

  it('matches nothing when no Project holds this repository', () => {
    expect(
      remoteProjectMatchingOrigin(
        [project({ origin: 'https://github.com/marckraw/segmemo.git' })],
        'https://github.com/marckraw/new-blok.git',
      ),
    ).toBeNull()
  })
})

describe('landedRemoteProjectCatalog', () => {
  const endpoints = [endpoint('daemon-a', 'https://a.test')]
  const source = providerCatalogSourceForHost('daemon-a', endpoints)

  it('keeps a reply that names the machine it was asked of', () => {
    expect(
      landedRemoteProjectCatalog(source, {
        executionHostId: 'daemon-a',
        supported: true,
        projects: [project()],
        unreachableReason: null,
      }),
    ).toEqual({
      status: 'landed',
      source,
      supported: true,
      projects: [project()],
      unreachableReason: null,
    })
  })

  it('refuses a reply that describes another machine, as a failure', () => {
    const state = landedRemoteProjectCatalog(source, {
      executionHostId: 'daemon-b',
      supported: true,
      projects: [project()],
      unreachableReason: null,
    })
    expect(state.status).toBe('failed')
    // Refused rather than dropped: a silent drop leaves the slot pending
    // forever, asking a machine that has already answered.
    expect(state.status === 'failed' && state.reason).toContain('daemon-b')
  })
})

describe('catalogInForce over Projects', () => {
  it('refuses a catalog read from an address the Endpoint has since left', () => {
    const before = providerCatalogSourceForHost('daemon-a', [
      endpoint('daemon-a', 'https://a.test'),
    ])
    const catalogs: RemoteProjectCatalogs = {
      'daemon-a': {
        status: 'landed',
        source: before,
        supported: true,
        projects: [project()],
        unreachableReason: null,
      },
    }

    expect(catalogInForce(catalogs, before)).not.toBeNull()

    const afterRepoint = providerCatalogSourceForHost('daemon-a', [
      endpoint('daemon-a', 'https://moved.test'),
    ])
    expect(catalogInForce(catalogs, afterRepoint)).toBeNull()
  })
})
