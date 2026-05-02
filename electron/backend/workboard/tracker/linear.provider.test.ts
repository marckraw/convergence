import { describe, expect, it, vi } from 'vitest'
import { LinearWorkboardProvider } from './linear.provider'
import type { WorkboardFetcher } from './tracker.types'

describe('LinearWorkboardProvider', () => {
  it('normalizes Linear issues into Workboard tracker issues', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '',
      json: async () => ({
        data: {
          issues: {
            nodes: [
              {
                id: 'lin-1',
                identifier: 'CONV-209',
                title: 'Inline comments',
                description: 'Acceptance criteria',
                url: 'https://linear.app/acme/issue/CONV-209',
                priorityLabel: 'High',
                updatedAt: '2026-04-30T10:00:00.000Z',
                state: { name: 'Todo' },
                assignee: { name: 'Marc' },
                labels: {
                  nodes: [{ name: 'convergence-loop' }, { name: 'loop-ready' }],
                },
              },
            ],
          },
        },
      }),
    })) satisfies WorkboardFetcher

    const provider = new LinearWorkboardProvider(fetcher)
    const issues = await provider.syncSource({
      id: 'source-linear',
      type: 'linear',
      name: 'Linear personal',
      enabled: true,
      auth: { token: 'lin_api_key' },
      sync: { labels: ['convergence-loop'], teamKey: 'CONV' },
      lastSyncAt: null,
      lastSyncError: null,
      createdAt: '',
      updatedAt: '',
    })

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.linear.app/graphql',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(issues).toEqual([
      expect.objectContaining({
        sourceId: 'source-linear',
        externalId: 'lin-1',
        externalKey: 'CONV-209',
        title: 'Inline comments',
        labels: ['convergence-loop', 'loop-ready'],
        status: 'Todo',
        priority: 'High',
        assignee: 'Marc',
      }),
    ])
  })
})
