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
      '2 wires followed the rename to "opus-mac"; 1 wire still waits for "BATON: horse opus"',
    )
    expect(
      formatSeatRenameCarryNotice({
        carried: 1,
        left: 0,
        oldName: 'horse opus',
        newName: 'opus-mac',
      }),
    ).toBe('1 wire followed the rename to "opus-mac"')
    expect(
      formatSeatRenameCarryNotice({
        carried: 0,
        left: 0,
        oldName: 'horse opus',
        newName: 'opus-mac',
      }),
    ).toBeNull()
  })

  it('names the clearing row and the plural left', () => {
    // Mutation: delete the left>0 / no-new-name branch → null → red.
    expect(
      formatSeatRenameCarryNotice({
        carried: 0,
        left: 1,
        oldName: 'horse opus',
        newName: null,
      }),
    ).toBe('1 wire still waits for "BATON: horse opus"')
    expect(
      formatSeatRenameCarryNotice({
        carried: 0,
        left: 2,
        oldName: 'horse opus',
        newName: null,
      }),
    ).toBe('2 wires still wait for "BATON: horse opus"')
  })

  it('A: a member-only carry says followed, never waits for', () => {
    // Unconditional spawn: carried by spawnMember alone, no token.
    // Mutation: bring back "now waits for" → red.
    expect(
      formatSeatRenameCarryNotice({
        carried: 1,
        left: 0,
        oldName: 'reviewer',
        newName: 'critic',
      }),
    ).toBe('1 wire followed the rename to "critic"')
    expect(
      formatSeatRenameCarryNotice({
        carried: 1,
        left: 0,
        oldName: 'reviewer',
        newName: 'critic',
      }),
    ).not.toMatch(/waits for/)
  })
})
