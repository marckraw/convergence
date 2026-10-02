import { describe, expect, it } from 'vitest'
import { composerCanSend } from './composer-send.pure'

const ready = {
  disabled: false,
  optionRow: { status: 'listed' as const },
  workAddress: { mode: 'hidden' as const },
  hasAttachmentErrors: false,
  attachmentsIngestInFlight: false,
  value: 'Ship it',
  attachmentCount: 0,
  hasPendingAnnotations: false,
}

describe('composerCanSend (CONV-30)', () => {
  it('sends words, a file, or a full annotation tray', () => {
    expect(composerCanSend(ready)).toBe(true)
    expect(composerCanSend({ ...ready, value: '  ', attachmentCount: 1 })).toBe(
      true,
    )
    expect(
      composerCanSend({ ...ready, value: '', hasPendingAnnotations: true }),
    ).toBe(true)
  })

  it('has nothing to send in an empty box with no file and no annotations', () => {
    expect(composerCanSend({ ...ready, value: ' \n ' })).toBe(false)
  })

  it('holds while disabled, while a file is read in, or while one is refused', () => {
    expect(composerCanSend({ ...ready, disabled: true })).toBe(false)
    expect(composerCanSend({ ...ready, attachmentsIngestInFlight: true })).toBe(
      false,
    )
    expect(composerCanSend({ ...ready, hasAttachmentErrors: true })).toBe(false)
  })

  it('holds until the machine says what it runs, and where the session works (MAR-2682, MAR-2689)', () => {
    expect(composerCanSend({ ...ready, optionRow: { status: 'notice' } })).toBe(
      false,
    )
    expect(
      composerCanSend({
        ...ready,
        workAddress: { mode: 'asking', text: 'Asking grok-mac…' },
      }),
    ).toBe(false)
    expect(
      composerCanSend({
        ...ready,
        workAddress: { mode: 'unavailable', text: 'grok-mac is offline' },
      }),
    ).toBe(false)
  })
})
