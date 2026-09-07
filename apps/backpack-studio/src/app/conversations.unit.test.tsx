import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  createStudioApiFixture,
  fixtureSnapshot,
} from '../shared/api/studio-api.fixture'
import { StudioApp } from './studio-app.container'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete window.backpackStudio
})
async function signIn() {
  vi.useFakeTimers()
  render(<StudioApp />)
  fireEvent.click(
    screen.getByRole('button', { name: 'Continue with Microsoft' }),
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600)
  })
}

it('starts from the first-request composer and opens the persisted transcript — mutation: drop start action', async () => {
  const startConversation = vi.fn(async () => ({
    kind: 'started' as const,
    conversationId: fixtureSnapshot.id,
  }))
  window.backpackStudio = createStudioApiFixture({ startConversation })
  await signIn()
  fireEvent.change(screen.getByRole('textbox', { name: 'Your request' }), {
    target: { value: 'Build my page' },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send ↑' }))
  })
  expect(startConversation).toHaveBeenCalledWith('Build my page')
  expect(screen.getByText('The saved answer')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Back to home' })).toBeTruthy()
})

it('suggestion sends its visible brief — mutation: detach the suggestion onStart', async () => {
  const startConversation = vi.fn(async () => ({
    kind: 'started' as const,
    conversationId: fixtureSnapshot.id,
  }))
  window.backpackStudio = createStudioApiFixture({ startConversation })
  await signIn()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Create and design/ }))
  })
  expect(startConversation).toHaveBeenCalledWith(
    'Create and design: Turn a brief or a Figma frame into a first draft.',
  )
})

it('restores the nav, sends a follow-up to its selection, then starts from home — mutations: drop list or detach either send', async () => {
  const sendMessage = vi.fn(async () => ({ kind: 'sent' as const }))
  const startConversation = vi.fn(async () => ({
    kind: 'started' as const,
    conversationId: fixtureSnapshot.id,
  }))
  window.backpackStudio = createStudioApiFixture({
    listConversations: async () => [fixtureSnapshot],
    sendMessage,
    startConversation,
  })
  await signIn()
  expect(
    screen.getByRole('heading', { name: 'What would you like to get done?' }),
  ).toBeTruthy()
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: /A saved conversation Done/ }),
    )
  })
  expect(screen.getByText('The saved answer')).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Follow up' },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send ↑' }))
  })
  expect(sendMessage).toHaveBeenCalledWith(fixtureSnapshot.id, 'Follow up')
  fireEvent.click(screen.getByRole('button', { name: 'Back to home' }))
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'New request' },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send ↑' }))
  })
  expect(startConversation).toHaveBeenCalledWith('New request')
})

it('live pushes outrank a pending snapshot and lock the busy composer — mutations: ignore revision or ignore busy state', async () => {
  let publish: (
    event: import('../shared/api').ConversationEvent,
  ) => void = () => {}
  let resolveSnapshot: (snapshot: typeof fixtureSnapshot) => void = () => {}
  const pending = new Promise<typeof fixtureSnapshot>((resolve) => {
    resolveSnapshot = resolve
  })
  window.backpackStudio = createStudioApiFixture({
    listConversations: async () => [fixtureSnapshot],
    getTranscript: () => pending,
    onConversationEvent: (listener) => {
      publish = listener
      return () => {}
    },
  })
  await signIn()
  expect(
    screen.getByRole('heading', { name: 'What would you like to get done?' }),
  ).toBeTruthy()
  fireEvent.click(
    screen.getByRole('button', { name: /A saved conversation Done/ }),
  )
  const updated = {
    ...fixtureSnapshot,
    status: 'running' as const,
    items: [{ ...fixtureSnapshot.items[0], text: 'The live answer' }],
  }
  await act(async () => {
    publish({ conversationId: updated.id, snapshot: updated })
    resolveSnapshot(fixtureSnapshot)
  })
  expect(screen.getByText('The live answer')).toBeTruthy()
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(
    true,
  )
  expect(
    screen.getByRole('button', { name: 'Send ↑' }).hasAttribute('disabled'),
  ).toBe(true)
})

it('names missing configuration in developer diagnostics — mutation: hide misconfigured diagnostics', async () => {
  window.backpackStudio = createStudioApiFixture({
    getStartup: async () => ({
      kind: 'misconfigured',
      missing: ['BACKPACK_STUDIO_DAEMON_TOKEN'],
    }),
    getDaemonStatus: async () => null,
  })
  await signIn()
  fireEvent.keyDown(window, { key: 'd', ctrlKey: true, shiftKey: true })
  expect(
    screen.getByText('Missing variables: BACKPACK_STUDIO_DAEMON_TOKEN'),
  ).toBeTruthy()
})
