import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { GlobalStatusBar } from './global-status-bar.presentational'

it('R4 status bar renders totals and a CPU-sorted hover list with shared and remote labels', async () => {
  render(
    <TooltipProvider>
      <GlobalStatusBar
        runningCount={2}
        attentionCount={0}
        byProject={[]}
        recency={null}
        providers={[]}
        onSelectProject={() => {}}
        meter={{
          agents: { cpu: 34, memoryMb: 2100 },
          convergence: { cpu: 12, memoryMb: 900 },
          rows: [
            {
              sessionId: 'slow',
              account: null,
              usage: { cpu: 4, memoryMb: 100 },
            },
            {
              sessionId: 'fast',
              account: 'Work',
              usage: { cpu: 30, memoryMb: 2000 },
            },
          ],
        }}
        meterSessions={
          [
            { id: 'slow', name: 'Claude' },
            { id: 'fast', name: 'Codex' },
            {
              id: 'remote',
              name: 'Cloud',
              executionHost: 'endpoint-1',
              status: 'running',
            },
          ] as SessionSummary[]
        }
      />
    </TooltipProvider>,
  )
  expect(screen.getByTestId('agent-meter-total')).toHaveTextContent(
    'Agents 34% · 2.1 GB · Convergence 12% · 900 MB',
  )
  fireEvent.focus(screen.getByTestId('agent-meter-total'))
  await waitFor(() =>
    expect(screen.getAllByTestId('agent-meter-list')[0]).toBeVisible(),
  )
  const list = screen.getAllByTestId('agent-meter-list')[0]
  expect(list.children[0]).toHaveTextContent(
    'Codex · 30% · 2.0 GB · shared · Work',
  )
  expect(list.children[1]).toHaveTextContent('Claude · 4% · 100 MB')
  expect(list).toHaveTextContent('Cloud · remote')
})
