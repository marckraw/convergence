import { describe, expect, it } from 'vitest'
import { attachmentRejectionsTitle } from './attachment-rejections.pure'

describe('attachmentRejectionsTitle (R10, CONV-7)', () => {
  it('names the one file it couldn’t attach', () => {
    expect(
      attachmentRejectionsTitle([{ filename: 'notes.pdf', reason: 'Too big' }]),
    ).toBe("Couldn't attach notes.pdf.")
  })

  it('counts the files when there are more', () => {
    expect(
      attachmentRejectionsTitle([
        { filename: 'a.bin', reason: 'Unsupported' },
        { filename: 'b.bin', reason: 'Unsupported' },
      ]),
    ).toBe("Couldn't attach 2 files.")
  })
})
