import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { snapshotWhileAnimating } from '../../../.storybook/motion-testing'
import { Button } from '../button/button'
import { notify } from './notify'
import { Toaster } from './toaster'

type Demo = 'tones' | 'actions' | 'busy' | 'failed' | 'long' | 'plain'

type ToastStageProps = {
  /** Which toasts "Show" raises. */
  demo: Demo
  onAction: () => void
  onSecondary: () => void
}

/** What each demo raises: the toasts the app sends, in its words. */
const raise = (
  demo: Demo,
  onAction: () => void,
  onSecondary: () => void,
): void => {
  switch (demo) {
    case 'tones':
      notify.warning('Agent waiting on you', {
        description: 'Fix the sidebar overflow needs an approval.',
        persistent: true,
      })
      notify.failure('update Codex', new Error('npm exited with code 1.'), {
        persistent: true,
      })
      notify.success('Crew exported', {
        description: '~/crews/night-shift.json',
        action: { label: 'Reveal', onClick: onAction },
        persistent: true,
      })
      return
    case 'actions':
      notify.info('Update available — Convergence v0.98.0', {
        description: 'Download and install when you’re ready.',
        action: { label: 'Download', onClick: onAction },
        secondaryAction: { label: 'Release notes', onClick: onSecondary },
        persistent: true,
      })
      return
    case 'busy':
      notify.loading('Downloading v0.98.0…', {
        description: '42% · 3.1 MB/s',
        persistent: true,
      })
      return
    case 'failed':
      notify.failure(
        'open the project',
        new Error('Visual Studio Code is not installed.'),
        { persistent: true },
      )
      return
    case 'long':
      notify.info(
        'Provider update available — Claude Code 2.1.285, with a name long enough to wrap',
        {
          description:
            'Update local provider CLIs when you are ready: ~/Library/Application Support/convergence/providers/claude-code/versions/2.1.285',
          persistent: true,
        },
      )
      return
    case 'plain':
      notify.message('Context at 82 % — Release notes for 0.98', {
        description: 'Over your 75 % alert · time to seal and compact',
        persistent: true,
      })
  }
}

/** The app's toast stack, and a button that raises the demo's toasts. */
function ToastStage({ demo, onAction, onSecondary }: ToastStageProps) {
  return (
    <div className="flex h-48 w-96 items-start">
      <Button
        variant="secondary"
        onClick={() => raise(demo, onAction, onSecondary)}
      >
        Show
      </Button>
      <Toaster />
    </div>
  )
}

/** The toast that shows `title`, once it has arrived. */
const toastWith = async (title: string | RegExp): Promise<HTMLElement> => {
  const words = await screen.findByText(title)
  const toast = words.closest<HTMLElement>('[data-sonner-toast]')
  if (!toast) throw new Error(`"${String(title)}" is not in a toast`)
  return toast
}

/** The glyph a toast leads with, its kind in a tone. */
const glyphOf = (toast: HTMLElement): Element => {
  const glyph = toast.querySelector('[data-icon] svg')
  if (!glyph) throw new Error('the toast has no glyph')
  return glyph
}

const meta = {
  title: 'Components/Toaster',
  component: ToastStage,
  args: { demo: 'tones', onAction: fn(), onSecondary: fn() },
} satisfies Meta<typeof ToastStage>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A toast is a popup (R8): the raised surface, its line and its shadow. Its
 * kind wears R1's tone on its glyph: success, warning, and danger for a
 * failure. The stack is a list in the notifications region.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show' }))
    const exported = await toastWith('Crew exported')
    const region = screen.getByRole('region', { name: /Notifications/ })
    await expect(within(region).getAllByRole('listitem')).toHaveLength(3)
    const surface = getComputedStyle(exported)
    await expect(surface.backgroundColor).toBe(tokenColor('--raised'))
    await expect(surface.borderTopColor).toBe(tokenColor('--line'))
    await expect(surface.boxShadow).not.toBe('none')
    await expect(getComputedStyle(glyphOf(exported)).color).toBe(
      tokenColor('--success-ink'),
    )
    const failed = await toastWith('Couldn’t update Codex.')
    await expect(getComputedStyle(glyphOf(failed)).color).toBe(
      tokenColor('--danger-ink'),
    )
    const waiting = await toastWith('Agent waiting on you')
    await expect(getComputedStyle(glyphOf(waiting)).color).toBe(
      tokenColor('--warning-ink'),
    )
    const path = within(exported).getByText('~/crews/night-shift.json')
    await expect(getComputedStyle(path).color).toBe(tokenColor('--ink-muted'))
    // Collapsed, a toast behind the front one hides its words under it.
    const wordsOf = (toast: HTMLElement) =>
      getComputedStyle(toast.querySelector('[data-content]') ?? toast).opacity
    await waitFor(() => expect(wordsOf(failed)).toBe('0'))
    await expect(wordsOf(exported)).toBe('1')
    await userEvent.click(
      within(exported).getByRole('button', { name: 'Reveal' }),
    )
    await expect(args.onAction).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(screen.queryByText('Crew exported')).not.toBeInTheDocument(),
    )
  },
}

/** The same surface and tones, in the dark theme's tokens. */
export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show' }))
    const exported = await toastWith('Crew exported')
    await expect(getComputedStyle(exported).backgroundColor).toBe(
      tokenColor('--raised'),
    )
    await expect(getComputedStyle(exported).color).toBe(tokenColor('--ink'))
    await expect(getComputedStyle(glyphOf(exported)).color).toBe(
      tokenColor('--success-ink'),
    )
  },
}

/**
 * Two things to do: the action a primary Button, the second one a secondary
 * Button before it. Either acts, and the toast leaves.
 */
export const Actions: Story = {
  args: { demo: 'actions' },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show' }))
    const update = await toastWith(/^Update available/)
    const buttons = within(update).getAllByRole('button')
    await expect(buttons.map((button) => button.textContent)).toEqual([
      'Release notes',
      'Download',
    ])
    await expect(getComputedStyle(glyphOf(update)).color).toBe(
      tokenColor('--info-ink'),
    )
    await userEvent.click(
      within(update).getByRole('button', { name: 'Release notes' }),
    )
    await expect(args.onSecondary).toHaveBeenCalledOnce()
    await expect(args.onAction).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.queryByText(/^Update available/)).not.toBeInTheDocument(),
    )
  },
}

/** Something under way: the Spinner leads, until a toast with its id ends it. */
export const Busy: Story = {
  args: { demo: 'busy' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show' }))
    const downloading = await toastWith('Downloading v0.98.0…')
    await expect(
      downloading.querySelector('[data-slot="spinner"]'),
    ).not.toBeNull()
    await waitFor(() =>
      expect(within(downloading).getByText('42% · 3.1 MB/s')).toBeVisible(),
    )
  },
}

/** A failure in R10's words, "Couldn’t <verb> <thing>.", the reason under it. */
export const Failed: Story = {
  args: { demo: 'failed' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show' }))
    const failed = await toastWith('Couldn’t open the project.')
    await waitFor(() =>
      expect(
        within(failed).getByText('Visual Studio Code is not installed.'),
      ).toBeVisible(),
    )
    await expect(getComputedStyle(glyphOf(failed)).color).toBe(
      tokenColor('--danger-ink'),
    )
  },
}

/** Long words wrap inside the stack's width; nothing runs out of the box. */
export const Long: Story = {
  args: { demo: 'long' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show' }))
    const update = await toastWith(/^Provider update available/)
    const stack = update.closest<HTMLElement>('[data-sonner-toaster]')
    await expect(update.getBoundingClientRect().width).toBe(
      stack?.getBoundingClientRect().width,
    )
    await expect(update.scrollWidth).toBeLessThanOrEqual(update.clientWidth)
  },
}

/** A neutral toast says it with words alone: no glyph. */
export const Plain: Story = {
  args: { demo: 'plain' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show' }))
    const alert = await toastWith(/^Context at 82 %/)
    await expect(alert.querySelector('[data-icon]')).toBeNull()
  },
}

/** Reduced motion: the toast fades in, and doesn't travel. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { demo: 'busy' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show' }))
    const downloading = await toastWith('Downloading v0.98.0…')
    const arriving = await snapshotWhileAnimating(downloading, 'opacity')
    await expect(arriving.properties).not.toContain('transform')
    await expect(arriving.shiftY).toBe(0)
  },
}
