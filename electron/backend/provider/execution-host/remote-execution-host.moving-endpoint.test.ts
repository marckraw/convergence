import { describe, expect, it } from 'vitest'
import {
  MAX_LISTING_ATTEMPTS,
  RemoteExecutionHost,
} from './remote-execution-host'
import { RemoteExecutionHostError } from './remote-execution-host.types'

/** The address of the nth machine one Endpoint has pointed at. */
const machineUrl = (machine: number): string =>
  `https://machine-${machine}.test`

/** What `machineUrl(machine)` lists, so a listing names the machine it is of. */
const machineProvider = (machine: number): string => `provider-${machine}`

interface MovingEndpoint {
  host: RemoteExecutionHost
  /** Provider listings asked for, as URLs, in the order they were sent. */
  metaUrls: string[]
  listedProviderIds: () => string[]
}

/**
 * A host whose Endpoint is pointed at a new machine during each of its first
 * `edits` listings, and then left alone.
 *
 * The edit lands inside the `/v0/meta` handler on purpose: that is the middle
 * of the round trip, so every listing here starts against the address in force
 * and finishes about one that has been left. `edits` is therefore exactly how
 * many attempts readiness must discard before one of them is an answer.
 */
function endpointEditedDuringItsFirstListings(edits: number): MovingEndpoint {
  const metaUrls: string[] = []
  let machine = 0
  let editsLeft = edits

  const host = new RemoteExecutionHost({
    connection: {
      resolveConnection: async () => ({
        baseUrl: machineUrl(machine),
        token: 'test-token',
      }),
    },
    fetch: (async (input: unknown) => {
      const url = String(input)
      // An older daemon's 404, so the handshake probe adds nothing to read.
      if (url.endsWith('/health')) return new Response(null, { status: 404 })

      metaUrls.push(url)
      const listed = machine
      if (editsLeft > 0) {
        editsLeft -= 1
        machine += 1
      }
      return new Response(
        JSON.stringify({
          providers: [
            {
              id: machineProvider(listed),
              label: `Provider ${listed}`,
              available: true,
              authenticated: true,
              models: [{ slug: 'sonnet', label: 'Sonnet' }],
              features: { resume: true, followup: true },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof fetch,
  })

  return {
    host,
    metaUrls,
    listedProviderIds: () =>
      host.capabilities().map((entry) => entry.providerId),
  }
}

/**
 * An Endpoint edited while its providers are being listed, taken to the last
 * attempt readiness is allowed (MAR-2620).
 *
 * `ensureListed` bounds how many listings it will make, and the bug this file
 * exists for was in how that bound ended: the check that says "this listing is
 * about the machine in force" ran at the top of each pass, so the final pass
 * made an attempt nobody ever looked at. A stable Endpoint whose daemon
 * answered on that attempt was refused with "the execution host endpoint kept
 * changing" — a sentence about a settings race that had not happened, and the
 * second false refusal in this slice after "Provider not found".
 *
 * Written directly against the host because standing on the last permitted
 * attempt means driving the configuration a known number of times, and the
 * suites that go through the settings service and `SessionService` cannot do
 * that without becoming a different test. What those suites prove is that
 * `whenReady` and a turn arrive here at all; what this one proves is where the
 * loop is allowed to end.
 */
describe('an endpoint edited while its providers are being listed', () => {
  it('accepts the listing that lands in force on the last permitted attempt', async () => {
    const endpoint = endpointEditedDuringItsFirstListings(
      MAX_LISTING_ATTEMPTS - 1,
    )

    // The refusal below is about a configuration that kept moving. This one
    // stopped moving, and its last permitted listing is a perfectly good
    // answer — it just happens to be the one the loop never looked at.
    await expect(endpoint.host.ensureListed()).resolves.toBeUndefined()

    const settled = MAX_LISTING_ATTEMPTS - 1
    expect(endpoint.metaUrls).toHaveLength(MAX_LISTING_ATTEMPTS)
    expect(endpoint.metaUrls.at(-1)).toBe(`${machineUrl(settled)}/v0/meta`)
    expect(endpoint.listedProviderIds()).toEqual([machineProvider(settled)])
  })

  it('still refuses when every permitted attempt landed about a machine already left', async () => {
    const endpoint = endpointEditedDuringItsFirstListings(MAX_LISTING_ATTEMPTS)

    const failure = await endpoint.host.ensureListed().then(
      () => null,
      (error: unknown) => error,
    )

    // Spending the bound and having nothing to show for it is the one thing
    // this sentence is allowed to mean.
    expect(failure).toBeInstanceOf(RemoteExecutionHostError)
    expect((failure as Error).message).toMatch(/kept changing/i)
    expect((failure as RemoteExecutionHostError).kind).toBe('configuration')
    expect(endpoint.metaUrls).toHaveLength(MAX_LISTING_ATTEMPTS)
    expect(endpoint.listedProviderIds()).toEqual([])
  })

  it.each(Array.from({ length: MAX_LISTING_ATTEMPTS }, (_, edits) => edits))(
    'never blames a moving endpoint for a run whose listing landed in force (%i edits)',
    async (edits) => {
      const endpoint = endpointEditedDuringItsFirstListings(edits)

      const failure = await endpoint.host.ensureListed().then(
        () => null,
        (error: unknown) => error,
      )

      expect(failure).toBeNull()
      expect(endpoint.listedProviderIds()).toEqual([machineProvider(edits)])
    },
  )
})
