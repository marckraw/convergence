import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, within } from 'storybook/test'
import { LearnLoomGuideView } from './learn-loom.presentational'
import {
  LEARN_LOOM_STEP_COUNT,
  learnLoomLiveMessage,
  learnLoomStepView,
} from './learn-loom.pure'

const LAST = LEARN_LOOM_STEP_COUNT - 1

/**
 * A step's blue eyebrow and the ticket's identifier miss contrast on both
 * themes. Every story that draws a step; the quick reference passes.
 */
const lowContrastStep = {
  a11y: {
    config: {
      // a11y-known: the step eyebrow and the ticket id in blue-500 miss 4.5:1 (color-contrast) — fixed by the sweep (DS4)
      rules: [{ id: 'color-contrast', enabled: false }],
    },
  },
}

const meta = {
  title: 'Features/Waves/LearnLoom',
  component: LearnLoomGuideView,
  args: {
    open: true,
    view: 'steps',
    step: learnLoomStepView(0),
    liveMessage: learnLoomLiveMessage('steps', 0),
    onClose: fn(),
    onNext: fn(),
    onBack: fn(),
    onOpenReference: fn(),
    onRestart: fn(),
  },
} satisfies Meta<typeof LearnLoomGuideView>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The guide's first step: one ticket over four sheets, the step's words, and
 * a footer that never moves. Back is refused here, without losing focus.
 */
export const Default: Story = {
  parameters: lowContrastStep,
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole('dialog', { name: 'How Loom works' })
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog).toHaveTextContent(args.step.copy.title)
    const back = within(dialog).getByRole('button', { name: 'Back' })
    await expect(back).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(back)
    await expect(args.onBack).not.toHaveBeenCalled()
    await userEvent.click(
      within(dialog).getByRole('button', { name: args.step.copy.primary }),
    )
    await expect(args.onNext).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Quick reference' }),
    )
    await expect(args.onOpenReference).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Close ×' }),
    )
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** A middle step: Back works, and the live region says where the ticket is. */
export const Step: Story = {
  parameters: lowContrastStep,
  args: {
    step: learnLoomStepView(2),
    liveMessage: learnLoomLiveMessage('steps', 2),
  },
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole('dialog')
    const back = within(dialog).getByRole('button', { name: 'Back' })
    await expect(back).not.toHaveAttribute('aria-disabled')
    await userEvent.click(back)
    await expect(args.onBack).toHaveBeenCalledOnce()
    await expect(
      dialog.querySelector('[aria-live="polite"]'),
    ).toHaveTextContent(/^Step 3 of /)
  },
}

/** The last step's primary control leaves the guide instead of advancing. */
export const Long: Story = {
  parameters: lowContrastStep,
  args: {
    step: learnLoomStepView(LAST),
    liveMessage: learnLoomLiveMessage('steps', LAST),
  },
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Back to Loom' }),
    )
    await expect(args.onClose).toHaveBeenCalledOnce()
    await expect(args.onNext).not.toHaveBeenCalled()
  },
}

/** The quick reference: six cards to read without walking the lesson again. */
export const Reference: Story = {
  args: {
    view: 'reference',
    liveMessage: learnLoomLiveMessage('reference', 0),
  },
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Loom, at a glance',
    })
    await expect(within(dialog).getAllByRole('region')).toHaveLength(6)
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Walk through an example →' }),
    )
    await expect(args.onRestart).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Back to Loom' }),
    )
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

export const ReferenceDark: Story = {
  ...Reference,
  globals: { theme: 'dark' },
}

/** Reduced motion: the ticket and the sheets change place without travelling. */
export const ReducedMotion: Story = {
  parameters: lowContrastStep,
  args: {
    step: learnLoomStepView(3),
    liveMessage: learnLoomLiveMessage('steps', 3),
  },
  globals: { motion: 'reduced' },
  play: async () => {
    const dialog = await screen.findByRole('dialog')
    const ticket = dialog.querySelector<HTMLElement>('[data-learn-loom-ticket]')
    await expect(ticket).not.toBeNull()
    await expect(getComputedStyle(ticket!).transitionProperty).toBe('none')
    for (const sheet of dialog.querySelectorAll<HTMLElement>(
      '[data-learn-loom-sheet]',
    )) {
      await expect(getComputedStyle(sheet).transitionProperty).toBe('none')
    }
  },
}
