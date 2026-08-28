import { describe, expect, it } from 'vitest'
import type { ExecutionHostEndpoint } from '@/entities/execution-host'
import {
  landedProviderCatalog,
  LOCAL_PROVIDER_CATALOG_SOURCE,
  localProviderCatalogs,
  offeredProviders,
  providerCatalogHostLabel,
  providerCatalogInForce,
  providerCatalogOf,
  providerCatalogSourceForHost,
  resolveOptionRowCatalog,
  selectableProviderDescriptors,
  type ProviderCatalogEntry,
} from './provider-catalog.pure'
import { EXECUTION_HOST_REQUEST_CASES } from '@/shared/lib/execution-host-id.fixture'
import type { ProviderInfo } from './session.types'

function endpoint(
  id: string,
  baseUrl: string,
  label = 'kuba-vps',
): ExecutionHostEndpoint {
  return {
    id,
    label,
    baseUrl,
    position: 0,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }
}

function provider(id: string, kind: ProviderInfo['kind'] = 'conversation') {
  return {
    id,
    name: id,
    vendorLabel: id,
    kind,
    supportsContinuation: true,
    defaultModelId: 'm1',
    modelOptions: [],
    attachments: {
      supportsImage: false,
      supportsPdf: false,
      supportsText: false,
      maxImageBytes: 0,
      maxPdfBytes: 0,
      maxTextBytes: 0,
      maxTotalBytes: 0,
    },
    midRunInput: {
      supportsAnswer: false,
      supportsNativeFollowUp: true,
      supportsAppQueuedFollowUp: false,
      supportsSteer: false,
      supportsInterrupt: true,
      defaultRunningMode: 'follow-up' as const,
    },
  } satisfies ProviderInfo
}

describe('providerCatalogSourceForHost', () => {
  it('reads every id in the shared table the way the main door does', () => {
    // One table, both doors (MAR-2682). This one used to read blank *or
    // whitespace* as this machine while `ProviderCatalogService.get` refused
    // whitespace by name, so the far refusal was unreachable from the product.
    // The rows below are the same rows that suite runs, from the same file.
    //
    // Mutation: restore `id.trim() === ''` here, and the `'   '` row goes red
    // -- this door answers Local for a value the main door treats as a machine.
    const endpoints = [endpoint('daemon-a', 'https://a.test')]
    for (const { id, thisMachine, why } of EXECUTION_HOST_REQUEST_CASES) {
      const source = providerCatalogSourceForHost(id, endpoints)
      if (thisMachine) {
        expect(source, why).toEqual(LOCAL_PROVIDER_CATALOG_SOURCE)
      } else {
        expect(source.executionHostId, why).toBe(id)
        expect(source, why).not.toEqual(LOCAL_PROVIDER_CATALOG_SOURCE)
      }
    }
  })

  it('puts the address in the configuration, not just the id', () => {
    // An Endpoint id outlives the address behind it, so a source that carried
    // only the id would go on matching a catalog read from the machine that id
    // used to name (MAR-2682, "a catalog dies with the address it was read
    // from").
    const before = providerCatalogSourceForHost('daemon-a', [
      endpoint('daemon-a', 'https://a.test'),
    ])
    const after = providerCatalogSourceForHost('daemon-a', [
      endpoint('daemon-a', 'https://moved.test'),
    ])
    expect(before.executionHostId).toBe(after.executionHostId)
    expect(before.configuration).not.toBe(after.configuration)
  })

  it('takes an id exactly as it stands, padded local included', () => {
    // One rule at both doors. `ProviderCatalogService.get` takes an id exactly
    // or refuses it by name; a renderer that trimmed first repaired ` kuba `
    // into `kuba` and made that refusal unreachable from the product. Padded
    // local is treated no differently from padded kuba: neither names a
    // machine anything is configured for (MAR-2682).
    const padded = providerCatalogSourceForHost(' daemon-a ', [
      endpoint('daemon-a', 'https://a.test'),
    ])
    expect(padded.executionHostId).toBe(' daemon-a ')
    expect(padded.configuration).not.toBe(
      providerCatalogSourceForHost('daemon-a', [
        endpoint('daemon-a', 'https://a.test'),
      ]).configuration,
    )
    const paddedLocal = providerCatalogSourceForHost(' local ', [])
    expect(paddedLocal).not.toEqual(LOCAL_PROVIDER_CATALOG_SOURCE)
    expect(paddedLocal.executionHostId).toBe(' local ')
  })

  it('gives an unconfigured endpoint a configuration no machine can have', () => {
    const ghost = providerCatalogSourceForHost('ghost', [])
    const real = providerCatalogSourceForHost('ghost', [
      endpoint('ghost', 'https://ghost.test'),
    ])
    expect(ghost.configuration).not.toBe(real.configuration)
  })
})

describe('providerCatalogInForce', () => {
  const source = providerCatalogSourceForHost('daemon-a', [
    endpoint('daemon-a', 'https://a.test'),
  ])
  const landed = landedProviderCatalog(
    source,
    providerCatalogOf('daemon-a', offeredProviders([provider('claude-code')])),
  )

  it('hands back a catalog while its endpoint still points where it was read', () => {
    expect(providerCatalogInForce({ 'daemon-a': landed }, source)).toBe(landed)
  })

  it('refuses one read from an address the endpoint has left', () => {
    const moved = providerCatalogSourceForHost('daemon-a', [
      endpoint('daemon-a', 'https://moved.test'),
    ])
    expect(providerCatalogInForce({ 'daemon-a': landed }, moved)).toBeNull()
  })

  it('never serves one endpoint’s catalog for another', () => {
    const other = providerCatalogSourceForHost('daemon-b', [
      endpoint('daemon-b', 'https://b.test'),
    ])
    expect(providerCatalogInForce({ 'daemon-a': landed }, other)).toBeNull()
  })

  it('survives a machine named after something on Object.prototype', () => {
    // The store is keyed by execution host id, and an id is not this code's
    // invention -- it comes off a settings row a human typed. `catalogs[id]`
    // for `toString` hands back an inherited *function*: truthy, typed as a
    // catalog state, and reading `.source.configuration` off it throws inside
    // a render. `ownRecordValue` is the only reason this answers null, and
    // nothing else proves it is wired here (MAR-2682, MAR-2590's `labelMap`).
    //
    // `__proto__` is the sharper half of the same key, and both are legal
    // Endpoint ids by `isExecutionHostEndpointId`: it resolves to an *object*
    // rather than a function, so it survives every "is this a real value"
    // reflex a reader might trust -- and then `.source` is undefined and the
    // read below it throws all the same.
    for (const key of ['toString', '__proto__']) {
      const named = providerCatalogSourceForHost(key, [
        endpoint(key, 'https://prototype.test'),
      ])
      expect(providerCatalogInForce({}, named)).toBeNull()
    }
  })

  it('refuses a pending entry belonging to another configuration too', () => {
    // Every state carries its provenance, not just the landed one — S1 spent a
    // round on exactly the state that did not (MAR-2620).
    const pending = { status: 'pending' as const, source }
    const moved = providerCatalogSourceForHost('daemon-a', [
      endpoint('daemon-a', 'https://moved.test'),
    ])
    expect(providerCatalogInForce({ 'daemon-a': pending }, moved)).toBeNull()
  })
})

describe('landedProviderCatalog', () => {
  it('refuses a reply that describes a machine nobody asked about', () => {
    // The echoed `executionHostId` is the guard its own wire docblock claims it
    // is, or it is decoration. Compared here or nowhere (MAR-2682, "the
    // echoed machine id is the guard, or it is decoration").
    const source = providerCatalogSourceForHost('daemon-a', [
      endpoint('daemon-a', 'https://a.test'),
    ])
    const state = landedProviderCatalog(
      source,
      providerCatalogOf('daemon-b', offeredProviders([provider('codex')])),
    )
    expect(state.status).toBe('failed')
    expect(state.status === 'failed' && state.reason).toContain('daemon-b')
    // And it is still filed under the machine that *was* asked, so the row can
    // say so rather than waiting forever on a question already answered.
    expect(state.source).toBe(source)
  })

  it('keeps only the providers a conversation can be started on', () => {
    // The shell provider is picked implicitly by terminal-session-create and
    // must never reach a composer's provider list.
    const state = landedProviderCatalog(
      LOCAL_PROVIDER_CATALOG_SOURCE,
      providerCatalogOf(
        'local',
        offeredProviders([provider('claude-code'), provider('shell', 'shell')]),
      ),
    )
    expect(state.status).toBe('landed')
    expect(
      state.status === 'landed' &&
        state.providers.map((entry) => entry.descriptor.id),
    ).toEqual(['claude-code'])
  })
})

describe('selectableProviderDescriptors', () => {
  it('keeps a blocked provider out, so no selection can resolve onto it', () => {
    const entries: ProviderCatalogEntry[] = [
      { descriptor: provider('cursor'), blockedReason: 'no binary' },
      { descriptor: provider('codex'), blockedReason: null },
    ]
    expect(selectableProviderDescriptors(entries).map((p) => p.id)).toEqual([
      'codex',
    ])
  })
})

describe('resolveOptionRowCatalog', () => {
  const remoteSource = providerCatalogSourceForHost('daemon-a', [
    endpoint('daemon-a', 'https://a.test'),
  ])

  it('never asks this machine to wait, in any state', () => {
    // Ruling 7: a Local row's options must not change, and a first-frame
    // sentence where its controls used to be is a change.
    for (const state of [
      null,
      { status: 'pending' as const, source: LOCAL_PROVIDER_CATALOG_SOURCE },
      {
        status: 'failed' as const,
        source: LOCAL_PROVIDER_CATALOG_SOURCE,
        reason: 'boom',
      },
    ]) {
      expect(
        resolveOptionRowCatalog({
          source: LOCAL_PROVIDER_CATALOG_SOURCE,
          hostLabel: 'Local',
          state,
        }),
      ).toEqual({ status: 'listed', entries: [], notice: null })
    }
  })

  it('says it is asking while a remote catalog is unknown or in flight', () => {
    for (const state of [
      null,
      { status: 'pending' as const, source: remoteSource },
    ]) {
      expect(
        resolveOptionRowCatalog({
          source: remoteSource,
          hostLabel: 'kuba-vps',
          state,
        }),
      ).toEqual({
        status: 'notice',
        notice: {
          kind: 'asking',
          text: 'Asking kuba-vps which providers it runs…',
        },
      })
    }
  })

  it('names the machine that could not be asked, and why', () => {
    expect(
      resolveOptionRowCatalog({
        source: remoteSource,
        hostLabel: 'kuba-vps',
        state: {
          status: 'failed',
          source: remoteSource,
          reason: 'ECONNREFUSED',
        },
      }),
    ).toEqual({
      status: 'notice',
      notice: {
        kind: 'unreachable',
        text: 'kuba-vps could not be asked: ECONNREFUSED',
      },
    })
  })

  it('tells a daemon that answered with nothing from one that never answered', () => {
    // The same empty list, two different facts. Reporting the second as the
    // first sends a reader hunting a provider problem that does not exist.
    const empty = providerCatalogOf('daemon-a', [])
    expect(
      resolveOptionRowCatalog({
        source: remoteSource,
        hostLabel: 'kuba-vps',
        state: landedProviderCatalog(remoteSource, empty),
      }),
    ).toMatchObject({ notice: { kind: 'empty' } })
    expect(
      resolveOptionRowCatalog({
        source: remoteSource,
        hostLabel: 'kuba-vps',
        state: landedProviderCatalog(remoteSource, {
          ...empty,
          unreachableReason: 'The daemon is unreachable.',
        }),
      }),
    ).toMatchObject({ notice: { kind: 'unreachable' } })
  })

  it('lists a landed remote catalog, blocked rows included', () => {
    const entries: ProviderCatalogEntry[] = [
      { descriptor: provider('cursor'), blockedReason: 'no binary' },
      { descriptor: provider('codex'), blockedReason: null },
    ]
    const row = resolveOptionRowCatalog({
      source: remoteSource,
      hostLabel: 'kuba-vps',
      state: landedProviderCatalog(
        remoteSource,
        providerCatalogOf('daemon-a', entries),
      ),
    })
    expect(row.status).toBe('listed')
    expect(
      row.status === 'listed' && row.entries.map((e) => e.descriptor.id),
    ).toEqual(['cursor', 'codex'])
    expect(row.status === 'listed' && row.notice).toBeNull()
  })

  it('says a machine could not be re-asked over the listing that survived', () => {
    // A dead daemon must not look alive. `describeCatalog` returns the
    // surviving listing *and* the failure together, so a refresh that failed
    // while an older answer was in hand was invisible: providers.length > 0
    // answered first and the reason was never read (MAR-2682, "a dead daemon
    // must not look alive").
    const row = resolveOptionRowCatalog({
      source: remoteSource,
      hostLabel: 'kuba-vps',
      state: landedProviderCatalog(
        remoteSource,
        providerCatalogOf(
          'daemon-a',
          offeredProviders([provider('codex')]),
          'The daemon is unreachable.',
        ),
      ),
    })

    // Still listed — a blip must not empty a row that was right a second ago.
    expect(row.status).toBe('listed')
    expect(
      row.status === 'listed' && row.entries.map((e) => e.descriptor.id),
    ).toEqual(['codex'])
    // And never silently.
    expect(row.status === 'listed' && row.notice).toEqual({
      kind: 'unreachable',
      text:
        'kuba-vps could not be re-asked: The daemon is unreachable. These ' +
        'are the providers it last reported.',
    })
  })

  it('says "could not be asked" only when nothing survived to qualify', () => {
    // Both notices are `unreachable` and both render loud; the sentences differ
    // because the facts do. "Could not be asked" over a row full of working
    // controls reads as a contradiction and gets dismissed.
    const row = resolveOptionRowCatalog({
      source: remoteSource,
      hostLabel: 'kuba-vps',
      state: landedProviderCatalog(
        remoteSource,
        providerCatalogOf('daemon-a', [], 'boom'),
      ),
    })
    expect(row.status).toBe('notice')
    expect(row.notice?.text).toBe('kuba-vps could not be asked: boom')
  })
})

describe('providerCatalogHostLabel', () => {
  it('calls a machine what the strip calls it', () => {
    expect(
      providerCatalogHostLabel('daemon-a', [
        endpoint('daemon-a', 'https://a.test', 'kuba-vps'),
      ]),
    ).toBe('kuba-vps')
    expect(
      providerCatalogHostLabel('daemon-a', [
        endpoint('daemon-a', 'https://a.test', '  '),
      ]),
    ).toBe('Unnamed endpoint')
  })
})

describe('localProviderCatalogs', () => {
  it('files this machine’s catalog under this machine, blocking nothing', () => {
    // The seed every suite in the tree uses. It goes through the same landing
    // the store does, so a fixture cannot express a catalog the product could
    // never produce — a nameless list, or a local provider the daemon blocked.
    const catalogs = localProviderCatalogs([
      provider('claude-code'),
      provider('shell', 'shell'),
    ])
    const local = providerCatalogInForce(
      catalogs,
      LOCAL_PROVIDER_CATALOG_SOURCE,
    )
    expect(local?.status).toBe('landed')
    expect(
      local?.status === 'landed' &&
        local.providers.map((entry) => ({
          id: entry.descriptor.id,
          blockedReason: entry.blockedReason,
        })),
    ).toEqual([{ id: 'claude-code', blockedReason: null }])
  })
})
