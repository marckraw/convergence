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
  RECORDED_NO_PROJECT_BODY,
  RECORDED_ONE_PROJECT_BODY,
  RECORDED_TWO_ISSUE_PAGE,
  RECORDED_TWO_PROJECT_BODY,
  RECORDED_UNAUTHORIZED_BODY,
  recordedReply,
} from './linear-tracker.fixture'

const KEY = 'lin_api_fixture_not_a_real_key'
const binding = normalizeTrackerBinding({ projectId: 'project-1' })
const now = () => new Date('2026-09-17T08:00:00.000Z')

function adapterAnswering(fetch: TrackerFetch) {
  return createLinearTrackerAdapter({ apiKey: KEY, binding, fetch, now })
}

/**
 * A fake far side that answers each query with its own reply (MAR-3156): the
 * probe is two reads now -- which project the key can see, then what it
 * holds -- and one canned body for both would prove nothing about either.
 */
function answering(replies: {
  projects?: unknown
  issues?: unknown
}): ReturnType<typeof vi.fn<TrackerFetch>> {
  return vi.fn<TrackerFetch>(async (_url, init) => {
    const body = JSON.parse(init.body) as { query: string }
    const isLookup = body.query.includes('ConvergenceTrackerProject')
    return recordedReply(
      200,
      isLookup
        ? (replies.projects ?? RECORDED_ONE_PROJECT_BODY)
        : (replies.issues ?? RECORDED_TWO_ISSUE_PAGE),
    )
  })
}

describe('MAR-3084 R2: the adapter agrees with the far side', () => {
  it('200 -> the labeled-issue count and the project it reached, with the personal key header', async () => {
    const fetch = answering({})
    // MAR-3156 R4: the count says what it counted and names the project.
    await expect(adapterAnswering(fetch).probe()).resolves.toEqual({
      ok: true,
      issues: 1,
      projectName: 'convergence',
    })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.linear.app/graphql')
    expect(init.headers.authorization).toBe(KEY)
    // The lookup goes first: a count for a project nobody can see is the
    // sentence this feature removes.
    expect(JSON.parse(init.body).query).toContain('ConvergenceTrackerProject')
  })

  it('MAR-3156 R4: an id no project answers to reads as a missing project, never a count', async () => {
    const fetch = answering({ projects: RECORDED_NO_PROJECT_BODY })
    // Mutation: fall back to the issue count when the lookup is empty ->
    // `projectName: 'convergence'` or a count, red.
    await expect(adapterAnswering(fetch).probe()).resolves.toEqual({
      ok: true,
      issues: 0,
      projectName: null,
    })
    // And it never asks what the project holds: there is no project.
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  describe('MAR-3156 R1/R2: finding the project a person named', () => {
    it('sends the filter each kind of reference deserves', async () => {
      const filterFor = async (reference: string) => {
        const fetch = answering({})
        await adapterAnswering(fetch).resolveProject(reference)
        return JSON.parse(fetch.mock.calls[0]![1].body).variables.filter
      }

      expect(await filterFor('4f6d2a1e-8b3c-4d5e-9f01-2a3b4c5d6e7f')).toEqual({
        id: { eq: '4f6d2a1e-8b3c-4d5e-9f01-2a3b4c5d6e7f' },
      })
      expect(
        await filterFor(
          'https://linear.app/marckraw/project/convergence-0a1b2c3d4e5f',
        ),
      ).toEqual({ slugId: { eq: '0a1b2c3d4e5f' } })
      // A name is what a person calls it, so case is not their problem.
      // Mutation: use `eq` -> `Convergence` misses `convergence`, and the
      // sentence this asserts is the only place that rule is written down.
      expect(await filterFor('Convergence')).toEqual({
        name: { eqIgnoreCase: 'Convergence' },
      })
    })

    it('one project resolves; several ask the person; none is not-found', async () => {
      await expect(
        adapterAnswering(answering({})).resolveProject('convergence'),
      ).resolves.toEqual({
        kind: 'resolved',
        project: {
          id: '0a1b2c3d4e5f',
          name: 'convergence',
          url: 'https://linear.app/example/project/convergence-0a1b2c3d4e5f',
        },
      })

      // Mutation: take `nodes[0]` -> this binds the first of two, red.
      const several = await adapterAnswering(
        answering({ projects: RECORDED_TWO_PROJECT_BODY }),
      ).resolveProject('convergence')
      expect(several.kind).toBe('ambiguous')
      expect(
        several.kind === 'ambiguous'
          ? several.candidates.map((project) => project.id)
          : [],
      ).toEqual(['0a1b2c3d4e5f', 'aabbccddeeff'])

      await expect(
        adapterAnswering(
          answering({ projects: RECORDED_NO_PROJECT_BODY }),
        ).resolveProject('nothing answers to this'),
      ).resolves.toEqual({ kind: 'not-found' })
    })

    it('an empty reference asks nobody', async () => {
      const fetch = answering({})
      const resolution = await adapterAnswering(fetch).resolveProject('   ')
      expect(resolution).toMatchObject({ kind: 'refused' })
      expect(fetch).not.toHaveBeenCalled()
    })

    it('a refused key is a refusal, and carries no key', async () => {
      const resolution = await adapterAnswering(async () =>
        recordedReply(401, RECORDED_UNAUTHORIZED_BODY),
      ).resolveProject('convergence')
      expect(resolution).toMatchObject({
        kind: 'refused',
        refusal: { kind: 'unauthorized' },
      })
      expect(JSON.stringify(resolution)).not.toContain(KEY)
    })

    it('a body that is not a project list is a bad-response, not an empty answer', async () => {
      // The difference that matters: "nothing answers to that name" sends a
      // person looking for a typo; "Linear answered something unreadable"
      // does not.
      await expect(
        adapterAnswering(async () =>
          recordedReply(200, { data: { projects: {} } }),
        ).resolveProject('convergence'),
      ).resolves.toMatchObject({
        kind: 'refused',
        refusal: { kind: 'bad-response' },
      })
    })
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

  it('lap 2, A: a truncated walk (more pages, no cursor) rejects, never returns the pages so far', async () => {
    const error = await adapterAnswering(async () =>
      recordedReply(
        200,
        linearIssuesBody(
          [
            linearIssueNode({
              id: 'a',
              identifier: 'EX-1',
              labels: [linearLabel('opus', 'horse')],
            }),
          ],
          { hasNextPage: true, endCursor: null },
        ),
      ),
    )
      .listLabeledIssues({
        projectId: 'project-1',
        labelPrefix: 'horse:',
        wavePrefix: 'wave:',
      })
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(TrackerRefusalError)
    expect((error as TrackerRefusalError).refusal.kind).toBe('bad-response')
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
