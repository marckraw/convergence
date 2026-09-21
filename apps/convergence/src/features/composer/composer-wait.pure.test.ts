import { describe, expect, it } from 'vitest'
import { COMPOSER_WAIT_NOTICES, composerWaitReason } from './composer-wait.pure'

describe('composerWaitReason (MAR-3288 R6)', () => {
  it('names the wait, the drill first', () => {
    expect(composerWaitReason({ compacting: false, drillRunning: false })).toBe(
      null,
    )
    expect(composerWaitReason({ compacting: true, drillRunning: false })).toBe(
      'compaction',
    )
    expect(composerWaitReason({ compacting: false, drillRunning: true })).toBe(
      'drill',
    )
    expect(composerWaitReason({ compacting: true, drillRunning: true })).toBe(
      'drill',
    )
  })

  it('says the ruled words', () => {
    expect(COMPOSER_WAIT_NOTICES.compaction).toBe(
      'Compacting context — messages you send now are queued and delivered after.',
    )
    expect(COMPOSER_WAIT_NOTICES.drill).toBe(
      'The drill is running — messages you send now are queued and delivered after.',
    )
  })
})
