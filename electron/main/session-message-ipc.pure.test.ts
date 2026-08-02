import { describe, expect, it } from 'vitest'
import { sendSessionMessageInputFromIpc } from './session-message-ipc.pure'

describe('sendSessionMessageInputFromIpc', () => {
  it('preserves context item ids for session start', () => {
    expect(
      sendSessionMessageInputFromIpc({
        text: 'start',
        contextItemIds: ['ctx-a', 'ctx-b'],
      }),
    ).toMatchObject({
      text: 'start',
      contextItemIds: ['ctx-a', 'ctx-b'],
    })
  })

  it('carries the selected provider account across the boundary', () => {
    // This function reconstructs the message field by field, so a dropped
    // account would be invisible: the turn would silently run on the default.
    expect(
      sendSessionMessageInputFromIpc({
        text: 'continue',
        providerAccountId: 'acct-b',
      }).providerAccountId,
    ).toBe('acct-b')
  })

  it('leaves the account unset when the composer made no selection', () => {
    expect(
      sendSessionMessageInputFromIpc({ text: 'continue' }).providerAccountId,
    ).toBeUndefined()
  })
})
