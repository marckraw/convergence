import { describe, expect, it } from 'vitest'
import { FeedbackService } from './feedback.service'

describe('FeedbackService', () => {
  it('submits a feature request to Convergence Cloud', async () => {
    const requests: Array<{ url: string | URL | Request; init?: RequestInit }> =
      []
    const fetch: typeof globalThis.fetch = async (url, init) => {
      requests.push({ url, init })
      return new Response('{}', { status: 202 })
    }
    const service = new FeedbackService({
      fetch,
      env: {
        INTERNAL_API_TOKEN: 'secret-token',
        CONVERGENCE_CLOUD_BASE_URL: 'https://convergence-cloud.vercel.app/',
      },
      platform: 'darwin',
      appVersion: '1.4.0',
      idFactory: () => 'feedback-1',
      now: () => new Date('2026-04-23T10:00:00.000Z'),
    })

    await expect(
      service.submit({
        title: 'Add export to Markdown',
        description: 'I want to export notes directly to Markdown files.',
        priority: 'medium',
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

    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe(
      'https://convergence-cloud.vercel.app/api/feedback/feature-requests',
    )
    expect(requests[0].init?.method).toBe('POST')
    expect(requests[0].init?.headers).toEqual({
      Authorization: 'Bearer secret-token',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(requests[0].init?.body as string)).toEqual({
      sourceApp: 'convergence',
      title: 'Add export to Markdown',
      description: 'I want to export notes directly to Markdown files.',
      priority: 'medium',
      metadata: {
        platform: 'darwin',
        appVersion: '1.4.0',
        contact: 'test@example.com',
        context: {
          activeProjectId: 'project-local',
          activeProjectName: 'Local project',
          activeSessionId: 'session-1',
        },
      },
    })
  })

  it('rejects empty feature request fields', async () => {
    const service = new FeedbackService({
      env: { INTERNAL_API_TOKEN: 'secret-token' },
    })

    await expect(
      service.submit({
        title: '   ',
        description: 'Useful details',
        priority: 'medium',
      }),
    ).rejects.toThrow('Feature request title is required.')

    await expect(
      service.submit({
        title: 'Useful title',
        description: '   ',
        priority: 'medium',
      }),
    ).rejects.toThrow('Feature request description is required.')
  })

  it('requires an internal API token', async () => {
    const service = new FeedbackService({ env: {} })

    await expect(
      service.submit({
        title: 'Useful title',
        description: 'Useful details',
        priority: 'medium',
      }),
    ).rejects.toThrow('INTERNAL_API_TOKEN is required to send feedback.')
  })

  it('surfaces failed cloud submissions', async () => {
    const service = new FeedbackService({
      env: { INTERNAL_API_TOKEN: 'secret-token' },
      fetch: async () => new Response('{}', { status: 500 }),
    })

    await expect(
      service.submit({
        title: 'Useful title',
        description: 'Useful details',
        priority: 'medium',
      }),
    ).rejects.toThrow('Feature request submission failed with HTTP 500.')
  })
})
