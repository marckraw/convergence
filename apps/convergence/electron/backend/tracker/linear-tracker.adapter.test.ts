import { describe, expect, it, vi } from 'vitest'
import {
  createLinearTrackerAdapter,
  type TrackerFetch,
} from './linear-tracker.adapter'
import { normalizeTrackerBinding } from './tracker-binding.pure'
import { TrackerRefusalError } from './tracker.types'
import {
  linearIssueNode,
  linearIssuesBody,
  linearLabel,
  RECORDED_200_WITH_ERRORS_BODY,
  RECORDED_TWO_ISSUE_PAGE,
  RECORDED_UNAUTHORIZED_BODY,
  recordedReply,
} from './linear-tracker.fixture'

const KEY = 'lin_api_fixture_not_a_real_key'
const binding = normalizeTrackerBinding({ projectId: 'project-1' })
const now = () => new Date('2026-09-17T08:00:00.000Z')

function adapterAnswering(fetch: TrackerFetch) {
  return createLinearTrackerAdapter({ apiKey: KEY, binding, fetch, now })
}

describe('MAR-3084 R2: the adapter agrees with the far side', () => {
  it('200 -> the labeled-issue count, with the personal key header', async () => {
    const fetch = vi.fn<TrackerFetch>(async () =>
      recordedReply(200, RECORDED_TWO_ISSUE_PAGE),
    )
    await expect(adapterAnswering(fetch).probe()).resolves.toEqual({
      ok: true,
      issues: 1,
    })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.linear.app/graphql')
    expect(init.headers.authorization).toBe(KEY)
  })

  it('401 Authentication required -> unauthorized', async () => {
    const probe = await adapterAnswering(async () =>
      recordedReply(401, RECORDED_UNAUTHORIZED_BODY),
    ).probe()
    expect(probe).toMatchObject({
      ok: false,
      refusal: { kind: 'unauthorized' },
    })
    expect(JSON.stringify(probe)).not.toContain(KEY)
  })

  it('429 with Retry-After -> rate-limited until then', async () => {
    await expect(
      adapterAnswering(async () =>
        recordedReply(429, {}, { 'Retry-After': '120' }),
      ).probe(),
    ).resolves.toEqual({
      ok: false,
      refusal: {
        kind: 'rate-limited',
        message: 'Linear is rate limiting this key.',
        retryAt: '2026-09-17T08:02:00.000Z',
      },
    })
  })

  it('200 carrying errors[] -> bad-response, never success', async () => {
    // Mutation: treat a 200 with errors[] as success -> the page beside the
    // errors parses, the probe reads `{ ok: true, issues: 1 }`, and this is red.
    await expect(
      adapterAnswering(async () =>
        recordedReply(200, RECORDED_200_WITH_ERRORS_BODY),
      ).probe(),
    ).resolves.toEqual({
      ok: false,
      refusal: {
        kind: 'bad-response',
        message: 'Linear answered with errors.',
        retryAt: null,
      },
    })
  })

  it('a network refusal -> unreachable', async () => {
    await expect(
      adapterAnswering(async () => {
        throw new TypeError('fetch failed')
      }).probe(),
    ).resolves.toMatchObject({ ok: false, refusal: { kind: 'unreachable' } })
  })

  it('listLabeledIssues rejects with a typed refusal, never a string', async () => {
    const error = await adapterAnswering(async () =>
      recordedReply(401, RECORDED_UNAUTHORIZED_BODY),
    )
      .listLabeledIssues({
        projectId: 'project-1',
        labelPrefix: 'horse:',
        wavePrefix: 'wave:',
      })
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(TrackerRefusalError)
    expect((error as TrackerRefusalError).refusal.kind).toBe('unauthorized')
  })

  it('follows the cursor to the last page', async () => {
    const pages = [
      linearIssuesBody(
        [
          linearIssueNode({
            id: 'a',
            identifier: 'EX-1',
            labels: [linearLabel('opus', 'horse')],
          }),
        ],
        { hasNextPage: true, endCursor: 'cursor-1' },
      ),
      linearIssuesBody([
        linearIssueNode({
          id: 'b',
          identifier: 'EX-2',
          labels: [linearLabel('grok', 'horse')],
        }),
      ]),
    ]
    const fetch = vi.fn<TrackerFetch>(async () =>
      recordedReply(200, pages.shift()),
    )
    const issues = await adapterAnswering(fetch).listLabeledIssues({
      projectId: 'project-1',
      labelPrefix: 'horse:',
      wavePrefix: 'wave:',
    })
    expect(issues.map((issue) => issue.identifier)).toEqual(['EX-1', 'EX-2'])
    expect(JSON.parse(fetch.mock.calls[1]![1].body).variables.after).toBe(
      'cursor-1',
    )
  })
})
