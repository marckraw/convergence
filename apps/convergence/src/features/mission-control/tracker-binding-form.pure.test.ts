import { describe, expect, it } from 'vitest'
import {
  probeAsksForKey,
  probeTimeLabel,
  TRACKER_PROJECT_MISSING_SENTENCE,
  trackerProbeSentence,
  trackerProjectProblem,
} from './tracker-binding-form.pure'

const AT = '2026-09-17T08:04:00.000Z'

describe('MAR-3084 R9: what the last Test found', () => {
  it('MAR-3156 R4: says what it counted and which project it reached', () => {
    // "issues in project" counted the LABELED issues and named no project.
    // Mutation: drop `labeled`, or drop the project's name -> red.
    expect(
      trackerProbeSentence({
        probe: { ok: true, issues: 12, projectName: 'convergence' },
        at: AT,
      }),
    ).toBe('12 labeled issues in convergence')
    expect(
      trackerProbeSentence({
        probe: { ok: true, issues: 1, projectName: 'convergence' },
        at: AT,
      }),
    ).toBe('1 labeled issue in convergence')
  })

  it('MAR-3156 R4: an id no project answers to is never a count', () => {
    // The whole defect in one line: `0 issues in project` read exactly like a
    // quiet project, so a mistyped id looked healthy.
    // Mutation: fall back to the count when the name is null -> "0 labeled
    // issues in null", red.
    expect(
      trackerProbeSentence({
        probe: { ok: true, issues: 0, projectName: null },
        at: AT,
      }),
    ).toBe(TRACKER_PROJECT_MISSING_SENTENCE)
    expect(TRACKER_PROJECT_MISSING_SENTENCE).not.toMatch(/\d/)
  })

  it('MAR-3156 R2: a lookup that did not settle says what to do next', () => {
    expect(trackerProjectProblem({ kind: 'not-found' })).toMatch(/paste/i)
    const ambiguous = trackerProjectProblem({
      kind: 'ambiguous',
      candidates: [
        { id: 'a', name: 'convergence', url: 'https://linear.app/a' },
        { id: 'b', name: 'Convergence', url: 'https://linear.app/b' },
      ],
    })
    // Both candidates, each with the URL that tells them apart.
    expect(ambiguous).toContain('https://linear.app/a')
    expect(ambiguous).toContain('https://linear.app/b')
    expect(
      trackerProjectProblem({
        kind: 'refused',
        refusal: {
          kind: 'unauthorized',
          message: 'detail',
          retryAt: null,
        },
      }),
    ).toBe('Linear refused the API key — detail')
  })

  it('names a refusal, and only a refused key asks for the key again', () => {
    const refused = (kind: 'unauthorized' | 'unreachable') => ({
      probe: {
        ok: false as const,
        refusal: { kind, message: 'detail', retryAt: null },
      },
      at: AT,
    })
    expect(trackerProbeSentence(refused('unreachable'))).toBe(
      'Linear could not be reached — detail',
    )
    expect(probeAsksForKey(refused('unauthorized'))).toBe(true)
    expect(probeAsksForKey(refused('unreachable'))).toBe(false)
    expect(probeAsksForKey(null)).toBe(false)
  })

  it('shows an unreadable time as it came', () => {
    expect(probeTimeLabel('not a time')).toBe('not a time')
    expect(probeTimeLabel(AT)).toMatch(/\d/)
  })
})
