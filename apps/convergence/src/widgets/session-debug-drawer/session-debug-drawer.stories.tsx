import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import type { ProviderDebugEntry } from '@/entities/provider-debug'
import { SessionDebugDrawer } from './session-debug-drawer.presentational'

const sessionId = '7f3c2a91-5d4e-4b8a-9c1f-2e6d8a0b4c3d'
const start = new Date('2026-10-01T12:00:00.000').getTime()

const entries: ProviderDebugEntry[] = [
  {
    sessionId,
    providerId: 'codex',
    at: start,
    direction: 'out',
    channel: 'request',
    method: 'turn/start',
    payload: { threadId: 'thr_1', input: [{ type: 'text', text: 'Ship it' }] },
  },
  {
    sessionId,
    providerId: 'codex',
    at: start + 412,
    direction: 'in',
    channel: 'notification',
    method: 'item/agentMessage/delta',
    payload: { delta: 'Committing the stories…' },
  },
  {
    sessionId,
    providerId: 'codex',
    at: start + 1830,
    direction: 'in',
    channel: 'stderr',
    bytes: 96,
    note: 'rate limit warning',
  },
  {
    sessionId,
    providerId: 'codex',
    at: start + 2004,
    direction: 'in',
    channel: 'lifecycle',
  },
]

const openDialog = async () => {
  const dialog = await screen.findByRole('dialog', {
    name: 'Provider debug log',
  })
  await waitFor(() =>
    expect(dialog).toContainElement(document.activeElement as HTMLElement),
  )
  // Rests once its pop-in has finished, so what is checked is what is seen.
  await waitFor(() =>
    expect(
      dialog.getAnimations().filter((a) => a.playState === 'running'),
    ).toHaveLength(0),
  )
  return dialog
}

const meta = {
  title: 'Widgets/SessionDebugDrawer/SessionDebugDrawer',
  component: SessionDebugDrawer,
  args: {
    open: true,
    onOpenChange: fn(),
    sessionId,
    entries,
    onCopyAll: fn(),
    onOpenLogFolder: fn(),
  },
} satisfies Meta<typeof SessionDebugDrawer>

export default meta

type Story = StoryObj<typeof meta>

/**
 * One row per captured event: time, channel, provider, direction, method,
 * and what it carried. Copy all and Open log folder act on the log.
 */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByText('4 entries · session 7f3c2a91'),
    ).toBeVisible()
    const rows = within(within(dialog).getByRole('list')).getAllByRole(
      'listitem',
    )
    await expect(rows).toHaveLength(4)
    await expect(rows[0]).toHaveTextContent('12:00:00.000')
    await expect(rows[2]).toHaveTextContent('rate limit warning • 96 bytes')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Copy all' }),
    )
    await expect(args.onCopyAll).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Open log folder' }),
    )
    await expect(args.onOpenLogFolder).toHaveBeenCalledOnce()
    await userEvent.keyboard('{Escape}')
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

/** Empty: nothing captured yet, so there is nothing to copy. */
export const Empty: Story = {
  args: { entries: [] },
  play: async () => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByText('No events captured yet'),
    ).toBeVisible()
    await expect(
      within(dialog).getByRole('button', { name: 'Copy all' }),
    ).toBeDisabled()
  },
}

/** Long: a busy session's log scrolls inside the drawer. */
export const Long: Story = {
  args: {
    entries: Array.from({ length: 60 }, (_, index) => ({
      sessionId,
      providerId: 'claude-code',
      at: start + index * 250,
      direction: index % 2 === 0 ? ('out' as const) : ('in' as const),
      channel: 'event' as const,
      method: 'stream_event',
      payload: { index, text: 'A streamed delta long enough to wrap.' },
    })),
  },
  play: async () => {
    const dialog = await openDialog()
    const box = dialog.getBoundingClientRect()
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight)
    await expect(
      within(dialog).getByRole('button', { name: 'Copy all' }),
    ).toBeVisible()
    // The events scroll, and the keyboard can reach them to scroll them.
    const events = within(dialog).getByRole('region', {
      name: 'Provider events',
    })
    await expect(events).toHaveAttribute('tabindex', '0')
    await expect(events.scrollHeight).toBeGreaterThan(events.clientHeight)
    // The newest event, at the bottom, is in reach rather than cut off (DLG-26).
    events.scrollTop = events.scrollHeight
    const rows = within(events).getAllByRole('listitem')
    const last = rows[rows.length - 1].getBoundingClientRect()
    await expect(last.bottom).toBeLessThanOrEqual(
      events.getBoundingClientRect().bottom + 1,
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
