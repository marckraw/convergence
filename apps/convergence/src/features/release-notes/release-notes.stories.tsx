import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { Button } from '@convergence/ui'
import { ReleaseNotesDialog } from './release-notes.presentational'
import type { ReleaseNotesEntry } from './release-notes.types'

type ReleaseNotesProps = ComponentProps<typeof ReleaseNotesDialog>

const releases: ReleaseNotesEntry[] = [
  {
    version: '0.98.0',
    date: '2026-09-30',
    notes:
      '### Minor Changes\n\n- Fast reaches the next turn of an open conversation.\n- Settings shows every account you are signed in with.\n\n### Patch Changes\n\n- The Codex bridge says when it is restarting.',
  },
  {
    version: '0.97.1',
    date: '2026-09-28',
    notes: '### Patch Changes\n\n- Copy link copies the link, not the title.',
  },
  {
    version: '0.97.0',
    date: '2026-09-26',
    notes:
      '### Minor Changes\n\n- Horse cards show the Figma and Linear connections they hold.',
  },
]

const historyOf = (
  entries: ReleaseNotesEntry[],
): ReleaseNotesProps['historyItems'] =>
  entries.map((release, absoluteIndex) => ({ release, absoluteIndex }))

const openDialog = async () => {
  const dialog = await screen.findByRole('dialog', {
    name: 'About Convergence',
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
  title: 'Features/ReleaseNotes/ReleaseNotesDialog',
  component: ReleaseNotesDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    bundle: { currentVersion: '0.98.0', releases },
    trigger: <Button variant="ghost">About</Button>,
    historyItems: historyOf(releases),
    historyPage: 1,
    historyTotalPages: 1,
    onHistoryPageChange: fn(),
  },
} satisfies Meta<typeof ReleaseNotesDialog>

export default meta

type Story = StoryObj<typeof meta>

/** The current release, then the history; the ✕ is the one way out. */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(dialog).toHaveAccessibleDescription(
      'Version 0.98.0 • Released 2026-09-30',
    )
    await expect(within(dialog).getByText('Current')).toBeVisible()
    await expect(
      within(dialog).queryByRole('navigation', {
        name: 'Release history pagination',
      }),
    ).toBeNull()
    // The notes take the keyboard's focus, so they scroll without a pointer.
    await expect(
      within(dialog).getByRole('region', { name: 'Release notes' }),
    ).toHaveAttribute('tabindex', '0')
    // No footer: the ✕ is the way out (R6).
    await expect(dialog.querySelector('[data-slot="dialog-footer"]')).toBeNull()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

/** Long: many releases, paged; Previous and Next walk the pages. */
export const Long: Story = {
  args: {
    bundle: {
      currentVersion: '0.98.0',
      releases: Array.from({ length: 24 }, (_, index) => ({
        version: `0.${98 - index}.0`,
        date: `2026-09-${String(30 - index).padStart(2, '0')}`,
        notes: `### Minor Changes\n\n- Release ${98 - index}: a change long enough to wrap onto a second line in the dialog, as real release notes do.`,
      })),
    },
    historyItems: historyOf(releases).map((item) => ({
      ...item,
      absoluteIndex: item.absoluteIndex + 5,
    })),
    historyPage: 2,
    historyTotalPages: 5,
  },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    const pages = within(dialog).getByRole('navigation', {
      name: 'Release history pagination',
    })
    await expect(within(dialog).getByText(/Page 2 of 5/)).toBeVisible()
    await userEvent.click(within(pages).getByRole('button', { name: 'Next' }))
    await expect(args.onHistoryPageChange).toHaveBeenCalledWith(3)
    await userEvent.click(
      within(pages).getByRole('button', { name: 'Previous' }),
    )
    await expect(args.onHistoryPageChange).toHaveBeenCalledWith(1)
    const box = dialog.getBoundingClientRect()
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight)
  },
}

/** The first page: Previous has nowhere to go. */
export const FirstPage: Story = {
  args: { historyPage: 1, historyTotalPages: 3 },
  play: async () => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByRole('button', { name: 'Previous' }),
    ).toBeDisabled()
    await expect(
      within(dialog).getByRole('button', { name: 'Next' }),
    ).toBeEnabled()
  },
}

/** Empty: a development build with no notes yet. */
export const Empty: Story = {
  args: {
    bundle: { currentVersion: '0.0.0-dev', releases: [] },
    historyItems: [],
  },
  play: async () => {
    const dialog = await openDialog()
    await expect(dialog).toHaveAccessibleDescription(
      'Version 0.0.0-dev • Development build',
    )
    await expect(within(dialog).queryByText('Current Release')).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Closed: only the trigger shows, and it opens the dialog. */
export const Closed: Story = {
  args: { open: false },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'About' }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(true)
  },
}
