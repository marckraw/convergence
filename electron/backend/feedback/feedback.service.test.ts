import { describe, expect, it } from 'vitest'
import { FeedbackService } from './feedback.service'

describe('FeedbackService', () => {
  it('accepts feedback without sending it to a remote service', async () => {
    const service = new FeedbackService({
      idFactory: () => 'feedback-1',
      now: () => new Date('2026-04-23T10:00:00.000Z'),
    })

    await expect(
      service.submit({
        kind: 'ui',
        message: 'The composer needs a clearer disabled state.',
        contact: 'test@example.com',
        context: {
          activeProjectId: 'project-local',
          activeProjectName: 'Local project',
          activeSessionId: 'session-1',
        },
      }),
    ).resolves.toEqual({
      id: 'feedback-1',
      acceptedAt: '2026-04-23T10:00:00.000Z',
    })
  })

  it('rejects empty feedback', async () => {
    const service = new FeedbackService()

    await expect(
      service.submit({ kind: 'bug', message: '   ' }),
    ).rejects.toThrow('Feedback message is required.')
  })
})
