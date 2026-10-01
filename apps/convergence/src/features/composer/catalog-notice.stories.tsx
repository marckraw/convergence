import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { CatalogNotice } from './catalog-notice.presentational'

const meta = {
  title: 'Features/Composer/CatalogNotice',
  component: CatalogNotice,
  args: {
    notice: {
      kind: 'asking',
      text: 'Asking grok-mac which providers it runs…',
    },
  },
} satisfies Meta<typeof CatalogNotice>

export default meta

type Story = StoryObj<typeof meta>

/** Waiting on a remote machine: the sentence stands where the controls will be. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Asking grok-mac which providers it runs…'),
    ).toBeVisible()
  },
}

/** The machine could not be asked: the loud one, with a warning sign. */
export const Failed: Story = {
  args: {
    notice: {
      kind: 'unreachable',
      text: 'grok-mac could not be asked: connect ECONNREFUSED 10.0.0.12:7420',
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/grok-mac could not be asked/)).toBeVisible()
  },
}

/** The machine answered and runs nothing. */
export const Empty: Story = {
  args: {
    notice: {
      kind: 'empty',
      text: 'grok-mac runs no providers yet.',
    },
  },
}

export const Dark: Story = {
  ...Failed,
  globals: { theme: 'dark' },
}
