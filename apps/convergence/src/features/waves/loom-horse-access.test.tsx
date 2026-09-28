import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useConnectionsOverviewStore } from '@/entities/provider-account'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { LoomHorseCardContainer } from './loom-horse.container'
import { loomHorses } from './loom-horses.pure'
import { loomSheets } from './loom-sheets.pure'
import { boundCrewWith, residentSeat } from './wave-rows.fixture'

const id = 'session-astra-mac'
const horse = () =>
  loomHorses({
    crews: [boundCrewWith('crew-1', 'Loom', [residentSeat('astra-mac')])],
    sessionsById: new Map([[id, { status: 'running' }]]),
    sheets: loomSheets([], 0),
    hostLabelOf: () => 'This Mac',
  })[0]
const getLastProviderAccountId = vi.fn(async (_id: string) => 'acct-icloud')

beforeEach(() => {
  getLastProviderAccountId.mockClear()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    session: { getLastProviderAccountId },
  }
  useSessionStore.setState({
    globalSessions: [
      {
        id,
        executionHost: 'local',
        updatedAt: '2026-09-28T09:00:00.000Z',
      } as SessionSummary,
    ],
  })
  useConnectionsOverviewStore.setState({
    running: null,
    checkedAt: '2026-09-28T09:00:00.000Z',
    rows: [
      {
        accountId: 'acct-icloud',
        provider: 'OpenAI',
        identity: 'marckraw@icloud.com',
        state: 'checked',
        paths: [
          {
            service: 'figma',
            via: 'Codex on this Mac',
            state: 'works',
            account: 'm@ef.com',
          },
          {
            service: 'linear',
            via: 'ChatGPT app',
            state: 'works',
            account: 'm@icloud.com',
          },
        ],
        error: null,
      },
    ],
  })
})

it("MAR-3519 a horse card shows its session's account's Figma and Linear reach", async () => {
  render(<LoomHorseCardContainer horse={horse()} />)
  expect(
    await screen.findByText('Figma works · Linear works · marckraw@icloud.com'),
  ).toHaveClass('text-success-ink')
  expect(getLastProviderAccountId).toHaveBeenCalledWith(id)
})

it('MAR-3519 a remote horse is not looked up here, and says so', async () => {
  useSessionStore.setState({
    globalSessions: [
      {
        id,
        executionHost: 'endpoint-1',
        updatedAt: '2026-09-28T09:00:00.000Z',
      } as SessionSummary,
    ],
  })
  render(<LoomHorseCardContainer horse={horse()} />)
  expect(
    screen.getByText('Figma, Linear: on another machine, not checked here'),
  ).toBeInTheDocument()
  // The lookup would run a tick later; give it the chance before denying it.
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(getLastProviderAccountId).not.toHaveBeenCalled()
})

it('MAR-3519 a lookup that cannot run shows no line rather than a guess', async () => {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {}
  render(<LoomHorseCardContainer horse={horse()} />)
  await Promise.resolve()
  expect(screen.queryByText(/Figma/)).toBeNull()
})
