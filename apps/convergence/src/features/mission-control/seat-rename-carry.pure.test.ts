import { describe, expect, it } from 'vitest'
import { formatSeatRenameCarryNotice } from './seat-rename-carry.pure'

describe('formatSeatRenameCarryNotice (MAR-3157 R6)', () => {
  it('builds the 2/1, 1/0 and 0/0 sentences', () => {
    expect(
      formatSeatRenameCarryNotice({
        carried: 2,
        left: 1,
        oldName: 'horse opus',
        newName: 'opus-mac',
      }),
    ).toBe(
      '2 wires now wait for "BATON: opus-mac" 1 wire still waits for "BATON: horse opus" (it targets another seat)',
    )
    expect(
      formatSeatRenameCarryNotice({
        carried: 1,
        left: 0,
        oldName: 'horse opus',
        newName: 'opus-mac',
      }),
    ).toBe('1 wire now waits for "BATON: opus-mac"')
    expect(
      formatSeatRenameCarryNotice({
        carried: 0,
        left: 0,
        oldName: 'horse opus',
        newName: 'opus-mac',
      }),
    ).toBeNull()
  })
})
