import { expect, it } from 'vitest'
import { readHarnessFactRow } from './harness-fact-row.pure'
it.each([
  'harness.hook',
  'harness.retry',
  'harness.compaction',
  'harness.denial',
  'harness.rateLimit',
  'harness.init',
])(
  'R2prime retains truncated %s — mutation drop placeholder turns red',
  (kind) => {
    expect(
      readHarnessFactRow(
        kind,
        { truncated: true, bytes: 9000, preview: 'envelope head' },
        'now',
      ),
    ).toMatchObject({ kind, truncated: true, at: 'now' })
  },
)

it.each([
  ['system', 'init', 'harness.init'],
  ['system', 'hook_started', 'harness.hook'],
  ['system', 'hook_progress', 'harness.hook'],
  ['system', 'hook_response', 'harness.hook'],
  ['system', 'api_retry', 'harness.retry'],
  ['system', 'compact_boundary', 'harness.compaction'],
  ['system', 'permission_denied', 'harness.denial'],
  ['rate_limit_event', null, 'harness.rateLimit'],
])(
  'RUN61 r5 legacy %s/%s survives — mutation omit raw subtype mapping turns red',
  (type, subtype, kind) => {
    expect(
      readHarnessFactRow(
        type,
        { truncated: true, bytes: 9000, preview: 'cut' },
        'now',
        subtype,
      ),
    ).toMatchObject({ kind, at: 'now', truncated: true })
  },
)
