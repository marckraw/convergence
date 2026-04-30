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
})
