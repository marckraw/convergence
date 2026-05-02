import { describe, expect, it, vi } from 'vitest'
import { JiraWorkboardProvider } from './jira.provider'
import type { WorkboardFetcher } from './tracker.types'

describe('JiraWorkboardProvider', () => {
  it('normalizes Jira issues into Workboard tracker issues', async () => {
    const fetcherMock = vi.fn<WorkboardFetcher>(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '',
      json: async () => ({
        issues: [
          {
            id: '10001',
            key: 'API-812',
            self: 'https://acme.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Billing migration',
              description: 'Investigate read model',
              labels: ['convergence-loop', 'loop-candidate'],
              status: { name: 'Selected' },
              priority: { name: 'Medium' },
              assignee: { displayName: 'Marc' },
              updated: '2026-04-30T10:00:00.000+0000',
            },
          },
        ],
      }),
    }))
    const fetcher = fetcherMock satisfies WorkboardFetcher

    const provider = new JiraWorkboardProvider(fetcher)
    const issues = await provider.syncSource({
      id: 'source-jira',
      type: 'jira',
      name: 'Jira work',
      enabled: true,
      auth: {
        siteUrl: 'https://acme.atlassian.net/',
        email: 'marc@example.com',
        apiToken: 'token',
      },
      sync: { jql: 'labels = convergence-loop' },
      lastSyncAt: null,
      lastSyncError: null,
      createdAt: '',
      updatedAt: '',
    })

    const calledUrl = new URL(fetcherMock.mock.calls[0]![0])
    expect(calledUrl.origin).toBe('https://acme.atlassian.net')
    expect(calledUrl.pathname).toBe('/rest/api/3/search')
    expect(calledUrl.searchParams.get('jql')).toBe('labels = convergence-loop')
    expect(issues).toEqual([
      expect.objectContaining({
        sourceId: 'source-jira',
        externalId: '10001',
        externalKey: 'API-812',
        url: 'https://acme.atlassian.net/browse/API-812',
        title: 'Billing migration',
        labels: ['convergence-loop', 'loop-candidate'],
        status: 'Selected',
        priority: 'Medium',
        assignee: 'Marc',
      }),
    ])
  })
})
