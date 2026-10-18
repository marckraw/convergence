import { describe, expect, it } from 'vitest'
import type { ExecutionToolAttachment } from '@mrck-labs/execution-host-protocol'
import { RemoteToolImageFetcher } from './remote-tool-images'

const CONNECTION = { baseUrl: 'http://daemon.test', token: 'test-token' }

function reference(
  id: string,
  sizeBytes = 4,
  mimeType = 'image/png',
): ExecutionToolAttachment {
  return { id, name: `${id}.png`, mimeType, sizeBytes, width: 2, height: 2 }
}

function bytesResponse(bytes: Uint8Array): Response {
  return new Response(bytes, {
    status: 200,
    headers: { 'Content-Type': 'application/octet-stream' },
  })
}

/** A fetch that serves `bodies` by attachment id and logs what it was asked. */
function hostServing(bodies: Record<string, Uint8Array>) {
  const requests: Array<{ url: string; authorization: string | null }> = []
  const fetchFn = (async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ) => {
    const url = String(input)
    requests.push({
      url,
      authorization: new Headers(init?.headers).get('Authorization'),
    })
    const id = decodeURIComponent(url.split('/attachments/')[1] ?? '')
    const body = bodies[id]
    return body ? bytesResponse(body) : new Response('missing', { status: 404 })
  }) as typeof fetch
  return { fetchFn, requests }
}

describe('RemoteToolImageFetcher', () => {
  it('downloads each image from the session it belongs to, authenticated', async () => {
    const host = hostServing({
      'img-1': new Uint8Array([1, 2, 3, 4]),
      'img 2': new Uint8Array([5, 6]),
    })
    const fetcher = new RemoteToolImageFetcher({ fetch: host.fetchFn })

    const fetched = await fetcher.fetch(
      CONNECTION,
      'remote session',
      [reference('img-1'), reference('img 2', 2, 'image/jpeg')],
      new AbortController().signal,
    )

    expect(fetched.omissions).toEqual({})
    expect(fetched.images).toEqual([
      {
        name: 'img-1.png',
        mimeType: 'image/png',
        bytes: new Uint8Array([1, 2, 3, 4]),
      },
      {
        name: 'img 2.png',
        mimeType: 'image/jpeg',
        bytes: new Uint8Array([5, 6]),
      },
    ])
    expect(host.requests.map((request) => request.url).sort()).toEqual([
      'http://daemon.test/v0/execution/sessions/remote%20session/attachments/img%202',
      'http://daemon.test/v0/execution/sessions/remote%20session/attachments/img-1',
    ])
    for (const request of host.requests)
      expect(request.authorization).toBe('Bearer test-token')
  })

  /**
   * Mutation: pass the kind's ceiling instead of the reference's size and the
   * longer body is stored.
   */
  it('refuses a body longer than its reference said, and counts it', async () => {
    const host = hostServing({ long: new Uint8Array(10) })
    const fetcher = new RemoteToolImageFetcher({ fetch: host.fetchFn })

    const fetched = await fetcher.fetch(
      CONNECTION,
      'session-1',
      [reference('long', 4)],
      new AbortController().signal,
    )

    expect(fetched).toEqual({ images: [], omissions: { 'download-failed': 1 } })
  })

  it('counts an image the host cannot serve, and keeps the ones it can', async () => {
    const host = hostServing({ ok: new Uint8Array([1, 2, 3, 4]) })
    const fetcher = new RemoteToolImageFetcher({ fetch: host.fetchFn })

    const fetched = await fetcher.fetch(
      CONNECTION,
      'session-1',
      [reference('gone'), reference('ok'), reference('doc', 4, 'text/plain')],
      new AbortController().signal,
    )

    expect(fetched.images.map((image) => image.name)).toEqual(['ok.png'])
    expect(fetched.omissions).toEqual({
      'download-failed': 1,
      'unsupported-mime-type': 1,
    })
    // The text reference was never asked for.
    expect(host.requests).toHaveLength(2)
  })

  it('gives up on a download that outlives its deadline', async () => {
    const hanging = (async (
      _input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason),
        )
      })) as typeof fetch
    const fetcher = new RemoteToolImageFetcher({
      fetch: hanging,
      timeoutMs: 20,
    })

    const fetched = await fetcher.fetch(
      CONNECTION,
      'session-1',
      [reference('slow')],
      new AbortController().signal,
    )

    expect(fetched).toEqual({ images: [], omissions: { 'download-failed': 1 } })
  })

  /** Mutation: drop the slot and all five requests are open at once. */
  it('keeps no more downloads open per host than its limit', async () => {
    let open = 0
    let mostOpen = 0
    const releases: Array<() => void> = []
    const fetchFn = (async () => {
      open += 1
      mostOpen = Math.max(mostOpen, open)
      await new Promise<void>((resolve) => releases.push(resolve))
      open -= 1
      return bytesResponse(new Uint8Array([1, 2, 3, 4]))
    }) as typeof fetch
    const fetcher = new RemoteToolImageFetcher({
      fetch: fetchFn,
      maxConcurrent: 2,
    })

    const fetching = fetcher.fetch(
      CONNECTION,
      'session-1',
      ['a', 'b', 'c', 'd', 'e'].map((id) => reference(id)),
      new AbortController().signal,
    )
    while ((await fetchedOrWaiting(fetching, releases)) === 'waiting');

    expect(mostOpen).toBe(2)
    await expect(fetching).resolves.toMatchObject({ omissions: {} })
    expect((await fetching).images).toHaveLength(5)
  })

  it('shares the limit between sessions on one host', async () => {
    const releases: Array<() => void> = []
    let open = 0
    let mostOpen = 0
    const fetchFn = (async () => {
      open += 1
      mostOpen = Math.max(mostOpen, open)
      await new Promise<void>((resolve) => releases.push(resolve))
      open -= 1
      return bytesResponse(new Uint8Array([1, 2, 3, 4]))
    }) as typeof fetch
    const fetcher = new RemoteToolImageFetcher({
      fetch: fetchFn,
      maxConcurrent: 1,
    })
    const signal = new AbortController().signal

    const both = Promise.all([
      fetcher.fetch(CONNECTION, 'session-1', [reference('a')], signal),
      fetcher.fetch(CONNECTION, 'session-2', [reference('b')], signal),
    ])
    while ((await fetchedOrWaiting(both, releases)) === 'waiting');

    expect(mostOpen).toBe(1)
  })

  it('leaves the line when its run is given up, and frees nothing it did not hold', async () => {
    const releases: Array<() => void> = []
    const fetchFn = (async () => {
      await new Promise<void>((resolve) => releases.push(resolve))
      return bytesResponse(new Uint8Array([1, 2, 3, 4]))
    }) as typeof fetch
    const fetcher = new RemoteToolImageFetcher({
      fetch: fetchFn,
      maxConcurrent: 1,
    })

    const holding = fetcher.fetch(
      CONNECTION,
      'session-1',
      [reference('a')],
      new AbortController().signal,
    )
    const quit = new AbortController()
    const queued = fetcher.fetch(
      CONNECTION,
      'session-2',
      [reference('b')],
      quit.signal,
    )
    await settle()
    quit.abort(new Error('quit'))
    await expect(queued).rejects.toThrow('quit')

    releases.shift()?.()
    await expect(holding).resolves.toMatchObject({ omissions: {} })
    // The slot the first held is free again: a third fetch goes straight out.
    const third = fetcher.fetch(
      CONNECTION,
      'session-3',
      [reference('c')],
      new AbortController().signal,
    )
    await settle()
    expect(releases).toHaveLength(1)
    releases.shift()?.()
    await expect(third).resolves.toMatchObject({ omissions: {} })
  })
})

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Lets the fetches run, then releases the oldest open request; `fetched` once
 * `promise` has resolved, so a loop can drain a line of downloads.
 */
async function fetchedOrWaiting(
  promise: Promise<unknown>,
  releases: Array<() => void>,
): Promise<'fetched' | 'waiting'> {
  let done = false
  void promise.then(() => {
    done = true
  })
  await settle()
  if (done) return 'fetched'
  releases.shift()?.()
  await settle()
  return done ? 'fetched' : 'waiting'
}
