import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ConversationEvent } from '../shared/api'
import {
  createStudioApiFixture,
  fixtureSnapshot,
} from '../shared/api/studio-api.fixture'
import { StudioApp } from './studio-app.container'

vi.mock('../features/home', () => ({
  Home: ({ conversations }: { conversations: unknown }) => (
    <pre data-testid="summaries">{JSON.stringify(conversations)}</pre>
  ),
}))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete window.backpackStudio
})
it('stores only summary fields from initial reads and pushes — mutation: retain snapshot in summaries', async () => {
  let publish: (event: ConversationEvent) => void = () => {}
  window.backpackStudio = createStudioApiFixture({
    listConversations: async () => [fixtureSnapshot],
    onConversationEvent: (listener) => {
      publish = listener
      return () => {}
    },
  })
  vi.useFakeTimers()
  render(<StudioApp />)
  fireEvent.click(
    screen.getByRole('button', { name: 'Continue with Microsoft' }),
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600)
  })
  const summary = {
    id: fixtureSnapshot.id,
    title: fixtureSnapshot.title,
    createdAt: fixtureSnapshot.createdAt,
    updatedAt: fixtureSnapshot.updatedAt,
    status: fixtureSnapshot.status,
  }
  expect(JSON.parse(screen.getByTestId('summaries').textContent!)).toEqual([
    summary,
  ])
  await act(async () => {
    publish({
      conversationId: fixtureSnapshot.id,
      snapshot: { ...fixtureSnapshot, title: 'Updated' },
    })
  })
  expect(JSON.parse(screen.getByTestId('summaries').textContent!)).toEqual([
    { ...summary, title: 'Updated' },
  ])
})
