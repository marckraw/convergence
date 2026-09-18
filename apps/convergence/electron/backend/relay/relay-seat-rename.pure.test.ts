import { describe, expect, it } from 'vitest'
import { batonConditionToken } from './relay.pure'
import {
  planSeatRenameCarry,
  type SeatRenameCarryWire,
} from './relay-seat-rename.pure'

function wire(
  partial: Partial<SeatRenameCarryWire> & { id: string },
): SeatRenameCarryWire {
  return {
    targetSessionId: null,
    conditionToken: null,
    spawnMember: null,
    ...partial,
  }
}

describe('planSeatRenameCarry (MAR-3157)', () => {
  const oldName = 'horse opus'
  const newName = 'opus-mac'

  it('R1: carries inbound tokens on the renamed seat; leaves fan-out; skips unconditional', () => {
    const plan = planSeatRenameCarry({
      oldName,
      newName,
      renamedMemberSessionId: 's-m',
      wires: [
        wire({
          id: 'in-1',
          targetSessionId: 's-m',
          conditionToken: batonConditionToken(oldName),
        }),
        wire({
          id: 'in-2',
          targetSessionId: 's-m',
          conditionToken: batonConditionToken(oldName),
        }),
        wire({
          id: 'fan-out',
          targetSessionId: 's-other',
          conditionToken: batonConditionToken(oldName),
        }),
        wire({
          id: 'return',
          targetSessionId: 's-source',
          conditionToken: null,
        }),
      ],
    })

    expect(plan.carried.sort()).toEqual(['in-1', 'in-2'])
    expect(plan.left).toEqual(['fan-out'])
    expect(plan.updates).toEqual([
      { id: 'in-1', conditionToken: batonConditionToken(newName) },
      { id: 'in-2', conditionToken: batonConditionToken(newName) },
    ])
  })

  it('R2: only an exact baton token moves — hand-written conditions stay', () => {
    const plan = planSeatRenameCarry({
      oldName,
      newName,
      renamedMemberSessionId: 's-m',
      wires: [
        wire({
          id: 'exact',
          targetSessionId: 's-m',
          conditionToken: batonConditionToken(oldName),
        }),
        wire({
          id: 'suffix',
          targetSessionId: 's-m',
          conditionToken: 'BATON: horse opus 2',
        }),
        wire({
          id: 'short',
          targetSessionId: 's-m',
          conditionToken: 'BATON: opus',
        }),
        wire({
          id: 'settled',
          targetSessionId: 's-m',
          conditionToken: 'settled',
        }),
        wire({
          id: 'none',
          targetSessionId: 's-m',
          conditionToken: null,
        }),
      ],
    })

    expect(plan.carried).toEqual(['exact'])
    expect(plan.left).toEqual([])
    expect(plan.updates).toEqual([
      { id: 'exact', conditionToken: batonConditionToken(newName) },
    ])
  })

  it('A: a recipe self-hail carries token and spawn member together', () => {
    // Mutation: carry the member without the token → updates lack conditionToken → red.
    const plan = planSeatRenameCarry({
      oldName: 'reviewer',
      newName: 'critic',
      renamedMemberSessionId: null,
      wires: [
        wire({
          id: 'self-hail',
          targetSessionId: null,
          conditionToken: 'BATON: reviewer',
          spawnMember: 'reviewer',
        }),
      ],
    })
    expect(plan.carried).toEqual(['self-hail'])
    expect(plan.left).toEqual([])
    expect(plan.updates).toEqual([
      {
        id: 'self-hail',
        conditionToken: 'BATON: critic',
        spawnMember: 'critic',
      },
    ])
  })

  it('A: a recipe rename does not treat a target-less unrelated wire as inbound', () => {
    // Mutation: drop the conversation-seat clause (null===null) → carried → red.
    const plan = planSeatRenameCarry({
      oldName,
      newName,
      renamedMemberSessionId: null,
      wires: [
        wire({
          id: 'unrelated',
          targetSessionId: null,
          conditionToken: batonConditionToken(oldName),
          spawnMember: null,
        }),
      ],
    })
    expect(plan.carried).toEqual([])
    expect(plan.left).toEqual(['unrelated'])
    expect(plan.updates).toEqual([])
  })

  it('R3/B: spawn member follows a recipe rename; a resident rename leaves the spawn alone', () => {
    const recipe = planSeatRenameCarry({
      oldName,
      newName,
      renamedMemberSessionId: null,
      wires: [wire({ id: 'spawn', spawnMember: oldName })],
    })
    expect(recipe.carried).toEqual(['spawn'])
    expect(recipe.updates).toEqual([{ id: 'spawn', spawnMember: newName }])

    // Resident + recipe may share a string; only the recipe is a spawn referent.
    const resident = planSeatRenameCarry({
      oldName,
      newName,
      renamedMemberSessionId: 's-resident',
      wires: [wire({ id: 'spawn', spawnMember: oldName })],
    })
    expect(resident.carried).toEqual([])
    expect(resident.left).toEqual([])
    expect(resident.updates).toEqual([])
  })

  it('R5: clearing carries nothing and lists every waiter on the old name', () => {
    const plan = planSeatRenameCarry({
      oldName,
      newName: null,
      renamedMemberSessionId: 's-m',
      wires: [
        wire({
          id: 'in',
          targetSessionId: 's-m',
          conditionToken: batonConditionToken(oldName),
        }),
        wire({
          id: 'fan',
          targetSessionId: 's-other',
          conditionToken: batonConditionToken(oldName),
        }),
        wire({ id: 'spawn', spawnMember: oldName }),
      ],
    })
    expect(plan.carried).toEqual([])
    expect(plan.updates).toEqual([])
    expect(plan.left.sort()).toEqual(['fan', 'in'])
  })

  it('R5: first naming carries nothing', () => {
    const plan = planSeatRenameCarry({
      oldName: null,
      newName,
      renamedMemberSessionId: 's-m',
      wires: [
        wire({
          id: 'in',
          targetSessionId: 's-m',
          conditionToken: batonConditionToken(newName),
        }),
      ],
    })
    expect(plan).toEqual({ updates: [], carried: [], left: [] })
  })
})
