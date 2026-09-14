import { expect, it } from 'vitest'
import { planCodexHistoryMigration } from './provider-account-codex-history.pure'

it('preflights the entire layout before authorizing any writes', () => {
  const plan = planCodexHistoryMigration({
    entries: [
      { entry: 'sessions', state: 'rollouts' },
      { entry: 'attachments', state: 'nonempty' },
    ],
    collisions: 0,
  })
  expect(plan.link).toEqual([])
  expect(plan.preserve).toEqual([])
  expect(plan.warnings.join(' ')).toContain('Nothing was changed')
})

it('refuses colliding rollouts without proposing a partial migration', () => {
  const plan = planCodexHistoryMigration({
    entries: [{ entry: 'sessions', state: 'rollouts' }],
    collisions: 2,
  })
  expect(plan.link).toEqual([])
  expect(plan.warnings.join(' ')).toContain('2 files already exist')
})

it('preserves real entries, links absent entries and leaves correct links alone', () => {
  expect(
    planCodexHistoryMigration({
      entries: [
        { entry: 'sessions', state: 'rollouts' },
        { entry: 'archived_sessions', state: 'shared' },
        { entry: 'attachments', state: 'absent' },
        { entry: 'session_index.jsonl', state: 'empty' },
      ],
      collisions: 0,
    }),
  ).toEqual({
    link: ['sessions', 'attachments', 'session_index.jsonl'],
    preserve: ['sessions', 'session_index.jsonl'],
    warnings: [],
  })
})
