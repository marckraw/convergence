import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { get } from 'https'
import { fetchLatestProviderVersion } from './detect'
import { getKnownProviders } from './provider-status.pure'

vi.mock('https', () => ({ get: vi.fn() }))

const cursor = getKnownProviders().find((provider) => provider.id === 'cursor')!
const sample =
  'DOWNLOAD_URL="https://downloads.cursor.com/lab/2026.09.18-9a7762b/${OS}/${ARCH}/agent-cli-package.tar.gz"'

function mockRequest(
  statusCode: number | undefined,
  body: string,
  failure?: 'timeout' | 'network' | 'response',
) {
  const request = new EventEmitter()
  const destroy = vi.fn((error: Error) => request.emit('error', error))
  Object.assign(request, { destroy })
  vi.mocked(get).mockImplementation(((
    _url: unknown,
    _options: unknown,
    callback: (response: EventEmitter) => void,
  ) => {
    queueMicrotask(() => {
      if (failure === 'timeout') {
        request.emit('timeout')
        return
      }
      if (failure === 'network') {
        request.emit('error', new Error('offline'))
        return
      }
      const response = Object.assign(new EventEmitter(), { statusCode })
      callback(response)
      if (failure === 'response') {
        response.emit('error', new Error('interrupted'))
        return
      }
      response.emit('data', Buffer.from(body))
      response.emit('end')
    })
    return request
  }) as typeof get)
  return destroy
}

afterEach(() => vi.resetAllMocks())

describe('Cursor latest-version dispatch', () => {
  it('fetches and parses installer text with the existing timeout policy', async () => {
    mockRequest(200, sample)
    await expect(fetchLatestProviderVersion(cursor)).resolves.toEqual({
      version: '2026.09.18-9a7762b',
      error: null,
    })
    expect(get).toHaveBeenCalledWith(
      'https://cursor.com/install',
      {
        headers: {
          Accept: 'text/plain',
          'User-Agent': 'Convergence provider status',
        },
        timeout: 5_000,
      },
      expect.any(Function),
    )
  })

  it.each([302, 401, 404, 500, undefined])(
    'reports HTTP %s without following redirects',
    async (status) => {
      mockRequest(status, sample)
      await expect(fetchLatestProviderVersion(cursor)).resolves.toEqual({
        version: null,
        error: `Cursor installer returned HTTP ${status ?? 'unknown'}`,
      })
    },
  )

  it('reports unrecognized installer text', async () => {
    mockRequest(200, '# 2026.09.18-9a7762b')
    await expect(fetchLatestProviderVersion(cursor)).resolves.toEqual({
      version: null,
      error: 'Cursor installer did not include a recognized version',
    })
  })

  it.each([
    ['timeout', 'Cursor installer request timed out'],
    ['network', 'offline'],
    ['response', 'interrupted'],
  ] as const)(
    'reports %s failure without rejecting',
    async (failure, error) => {
      const destroy = mockRequest(200, sample, failure)
      await expect(fetchLatestProviderVersion(cursor)).resolves.toEqual({
        version: null,
        error,
      })
      if (failure === 'timeout')
        expect(destroy).toHaveBeenCalledWith(expect.any(Error))
    },
  )

  it('handles synchronous request errors', async () => {
    vi.mocked(get).mockImplementation(() => {
      throw new Error('request failed')
    })
    await expect(fetchLatestProviderVersion(cursor)).resolves.toEqual({
      version: null,
      error: 'request failed',
    })
  })
})
