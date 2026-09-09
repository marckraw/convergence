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
