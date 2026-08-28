import { describe, expect, it, vi } from 'vitest'
import { EXECUTION_HOST_REQUEST_CASES } from '../../../src/shared/lib/execution-host-id.fixture'
import { ProviderCatalogService } from './provider-catalog.service'
import type { ProviderDescriptor } from './provider.types'
import type { ProviderCatalogEntry } from './provider-catalog.types'

function descriptor(id: string, name = id): ProviderDescriptor {
  return {
    id,
    name,
    vendorLabel: name,
    kind: 'conversation',
    supportsContinuation: true,
    defaultModelId: 'm1',
    modelOptions: [
      { id: 'm1', label: 'Model One', defaultEffort: null, effortOptions: [] },
    ],
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
      defaultRunningMode: 'follow-up',
    },
  }
}

function offered(...ids: string[]): ProviderCatalogEntry[] {
  return ids.map((id) => ({ descriptor: descriptor(id), blockedReason: null }))
}

function build(
  overrides: {
    local?: ProviderDescriptor[]
    endpoints?: string[]
    catalogs?: Record<
      string,
      { providers: ProviderCatalogEntry[]; unreachableReason: string | null }
    >
    withRemote?: boolean
  } = {},
) {
  const asked: string[] = []
  const service = new ProviderCatalogService({
    local: { describe: async () => overrides.local ?? [descriptor('pi')] },
    filterLocalDescriptors: (descriptors) => descriptors,
    remote:
      overrides.withRemote === false
        ? undefined
        : {
            listEndpointIds: async () => overrides.endpoints ?? ['daemon-a'],
            hostFor: (endpointId) => {
              asked.push(endpointId)
              return {
                describeCatalog: async () =>
                  overrides.catalogs?.[endpointId] ?? {
                    providers: [],
                    unreachableReason: null,
                  },
              }
            },
          },
  })
  return { service, asked }
}

describe('ProviderCatalogService', () => {
  it('answers for this machine when nothing names another one', async () => {
    // The whole accepted set, and it is exactly four values: a caller that
    // predates Endpoints says nothing and keeps getting what it always got.
    const { service, asked } = build()
    for (const hostId of [undefined, null, '', 'local']) {
      const catalog = await service.get(hostId)
      expect(catalog.executionHostId).toBe('local')
      expect(catalog.providers.map((entry) => entry.descriptor.id)).toEqual([
        'pi',
      ])
      expect(catalog.unreachableReason).toBeNull()
    }
    // And no daemon was troubled about any of it.
    expect(asked).toEqual([])
  })

  it('asks the endpoint named, and answers about that one', async () => {
    const { service, asked } = build({
      endpoints: ['daemon-a', 'daemon-b'],
      catalogs: {
        'daemon-a': {
          providers: offered('claude-code'),
          unreachableReason: null,
        },
        'daemon-b': { providers: offered('codex'), unreachableReason: null },
      },
    })

    const a = await service.get('daemon-a')
    const b = await service.get('daemon-b')

    expect(a.executionHostId).toBe('daemon-a')
    expect(a.providers.map((entry) => entry.descriptor.id)).toEqual([
      'claude-code',
    ])
    expect(b.executionHostId).toBe('daemon-b')
    expect(b.providers.map((entry) => entry.descriptor.id)).toEqual(['codex'])
    expect(asked).toEqual(['daemon-a', 'daemon-b'])
    // The local registry is never consulted for either one, which is the whole
    // defect S3 closes (MAR-2682).
    expect(a.providers.map((entry) => entry.descriptor.id)).not.toContain('pi')
  })

  it('refuses an endpoint that is not configured, without minting a host for it', async () => {
    // Saying "no providers" about a machine nobody configured reads as a daemon
    // that runs nothing. It also has to happen before `hostFor`, which would
    // otherwise build and cache a host for a stale or mistyped id.
    const { service, asked } = build({ endpoints: ['daemon-a'] })

    const catalog = await service.get('ghost')

    expect(catalog.executionHostId).toBe('ghost')
    expect(catalog.providers).toEqual([])
    expect(catalog.unreachableReason).toMatch(/not configured/)
    expect(asked).toEqual([])
  })

  it('takes an endpoint id exactly as given, or refuses it', async () => {
    // S2 killed the trim on the settings door -- "a quiet rewrite of the one
    // value that must not be rewritten" -- and this door must not reinstate it.
    // ` daemon-a ` is not `daemon-a`; answering for the latter would answer,
    // about a machine, a question that was asked about a different string.
    const { service, asked } = build({
      endpoints: ['daemon-a'],
      catalogs: {
        'daemon-a': { providers: offered('codex'), unreachableReason: null },
      },
    })

    const padded = await service.get(' daemon-a ')

    expect(padded.providers).toEqual([])
    expect(padded.unreachableReason).toMatch(/is not usable/)
    // Refused before a host could be minted for it, exactly like a ghost id.
    expect(asked).toEqual([])
    // And the id it refused is the one it was handed, unrewritten.
    expect(padded.executionHostId).toBe(' daemon-a ')
  })

  it('refuses padded local exactly as it refuses padded kuba', async () => {
    // The same ruling, at the other door. ` local ` is not `local`: it names no
    // machine, and reading it as this one is the trim S2 killed wearing a
    // different hat (MAR-2682). Mutation: ask `isLocalExecutionHost` here
    // again, and this goes red.
    const { service, asked } = build()

    const padded = await service.get(' local ')

    expect(padded.executionHostId).toBe(' local ')
    expect(padded.providers).toEqual([])
    expect(padded.unreachableReason).toMatch(/is not usable/)
    expect(asked).toEqual([])
  })

  it('refuses a whitespace-only id rather than reading it as this machine', async () => {
    // `parseExecutionHostId` reads blank as local when it reads a *record*,
    // where blank is a column nobody ever wrote. A request is not a record: a
    // caller that sent whitespace sent a value, and it is not an id.
    const { service, asked } = build()

    const catalog = await service.get('   ')

    expect(catalog.executionHostId).toBe('   ')
    expect(catalog.unreachableReason).toMatch(/is not usable/)
    expect(asked).toEqual([])
  })

  it('refuses an id that is not a string, instead of coercing it', async () => {
    // The argument comes off IPC, so the type is a claim and the runtime is the
    // fact. `String(...)` used to stand in for this check, and before that the
    // value fell through `isLocalExecutionHost` -- which reads a non-string as
    // blank, and blank as this machine. A request that meant a daemon was
    // answered with a laptop's provider list (MAR-2682).
    const { service, asked } = build()

    for (const value of [42, {}, true, ['daemon-a']]) {
      const catalog = await service.get(value)
      expect(catalog.executionHostId).not.toBe('local')
      expect(catalog.providers).toEqual([])
      expect(catalog.unreachableReason).toMatch(/is not usable/)
    }
    expect(asked).toEqual([])
  })

  it('reads every id in the shared table the way the renderer door does', async () => {
    // One table, both doors (MAR-2682). The rule -- which values mean this
    // machine -- was read here for itself and in `providerCatalogSourceForHost`
    // for itself, and the two widened apart three rounds running. The shared
    // predicate is the repair; this is the row-by-row proof that this door goes
    // through it, and its twin in `provider-catalog.pure.test.ts` is the same
    // rows at the other one.
    //
    // Mutation: call `isLocalExecutionHost` here again (or trim the id), and
    // the padded and whitespace rows go red -- this door answers Local for a
    // value the renderer door treats as a machine.
    const { service } = build({
      endpoints: ['daemon-a'],
      catalogs: {
        'daemon-a': { providers: offered('codex'), unreachableReason: null },
      },
    })

    for (const { id, thisMachine, why } of EXECUTION_HOST_REQUEST_CASES) {
      const catalog = await service.get(id)
      const provided = catalog.providers.map((entry) => entry.descriptor.id)
      if (thisMachine) {
        expect(catalog.executionHostId, why).toBe('local')
        // Named, and answered from the local registry rather than merely
        // echoed: `pi` is what this machine offers in this fixture.
        expect(provided, why).toEqual(['pi'])
      } else {
        expect(catalog.executionHostId, why).toBe(id)
        expect(provided, why).not.toContain('pi')
      }
    }
  })

  it('refuses a value it cannot serialise instead of throwing while refusing it', async () => {
    // The refusal has to be total. `describeNonStringExecutionHostId` ran
    // `JSON.stringify` over the value it was refusing, so the sentence that
    // exists to identify a bad id crashed on one: a BigInt throws, a circular
    // object throws, and a `toJSON` the caller wrote throws whatever it likes.
    // A door that promises an unreachable catalog for every bad id must not
    // hand back an exception for some of them (MAR-2682).
    //
    // The formatter's own table lives in `provider-catalog.pure.test.ts`. This
    // is the door's claim, which is a different one and needs the hostile values
    // driven through `get` itself: a serialiser reintroduced *here* would leave
    // that table green.
    //
    // Mutation: describe the value with `JSON.stringify` in `get`, and all three
    // rows go red -- `get` rejects instead of answering.
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const hostile = {
      toJSON() {
        throw new Error('the value decides what its own refusal says')
      },
    }
    const { service, asked } = build()

    for (const value of [1n, circular, hostile]) {
      const catalog = await service.get(value)
      expect(catalog.providers).toEqual([])
      expect(catalog.unreachableReason).toMatch(/is not usable/)
      expect(catalog.executionHostId).not.toBe('local')
    }
    // And the sentence is the formatter's, so the door carries its words rather
    // than words of its own.
    expect((await service.get(1n)).unreachableReason).toContain('a bigint (1)')
    expect(asked).toEqual([])
  })

  it('says so when this runtime has no remote execution at all', async () => {
    const { service } = build({ withRemote: false })
    const catalog = await service.get('daemon-a')
    expect(catalog.providers).toEqual([])
    expect(catalog.unreachableReason).toMatch(
      /not available in this app runtime/,
    )
  })

  it('carries a daemon’s refusal through, and its reason with it', async () => {
    const { service } = build({
      catalogs: {
        'daemon-a': {
          providers: [
            {
              descriptor: descriptor('cursor', 'Cursor'),
              blockedReason:
                'The daemon reports Cursor as unavailable: no binary.',
            },
          ],
          unreachableReason: null,
        },
      },
    })

    const catalog = await service.get('daemon-a')
    expect(catalog.providers[0]?.blockedReason).toBe(
      'The daemon reports Cursor as unavailable: no binary.',
    )
  })

  it('applies this machine’s descriptor filtering to this machine only', async () => {
    // Pi model visibility is a preference about a local CLI. Running it over a
    // daemon's listing would be a local setting editing a remote answer.
    const filterLocalDescriptors = vi.fn((descriptors: ProviderDescriptor[]) =>
      descriptors.filter((d) => d.id !== 'pi'),
    )
    const service = new ProviderCatalogService({
      local: { describe: async () => [descriptor('pi'), descriptor('codex')] },
      filterLocalDescriptors,
      remote: {
        listEndpointIds: async () => ['daemon-a'],
        hostFor: () => ({
          describeCatalog: async () => ({
            providers: offered('pi'),
            unreachableReason: null,
          }),
        }),
      },
    })

    const local = await service.get('local')
    expect(local.providers.map((entry) => entry.descriptor.id)).toEqual([
      'codex',
    ])

    const remote = await service.get('daemon-a')
    expect(remote.providers.map((entry) => entry.descriptor.id)).toEqual(['pi'])
    expect(filterLocalDescriptors).toHaveBeenCalledTimes(1)
  })
})
