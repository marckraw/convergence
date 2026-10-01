import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ProjectScript } from '@/entities/project-script'
import { expect, fn } from 'storybook/test'
import { ProjectActionsTrigger } from './project-actions-trigger.presentational'

const tests: ProjectScript = {
  id: 'script-tests',
  projectId: 'convergence',
  name: 'Run tests',
  command: 'npm run test:unit',
  icon: 'test',
  cwd: null,
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
}

const meta = {
  title: 'Widgets/Project actions menu/Project actions trigger',
  component: ProjectActionsTrigger,
  args: {
    selectedScript: tests,
    running: false,
    onClick: fn(),
  },
} satisfies Meta<typeof ProjectActionsTrigger>

export default meta

type Story = StoryObj<typeof meta>

/** The header's actions button, named for the action it last ran. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Run tests' })
    await expect(trigger).toHaveAccessibleDescription('Project actions')
    await userEvent.click(trigger)
    await expect(args.onClick).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** No action chosen yet: it says what it is. */
export const Empty: Story = {
  args: { selectedScript: null },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Project actions' }),
    ).toBeVisible()
  },
}

/** While the action runs, the same button, in the running colour. */
export const Busy: Story = {
  args: { running: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Run tests' }),
    ).toBeVisible()
  },
}

/** A long action name is cut short; the chevron keeps its place. */
export const Long: Story = {
  args: {
    selectedScript: {
      ...tests,
      name: 'Build, sign and notarise the macOS release',
    },
  },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('button', {
      name: 'Build, sign and notarise the macOS release',
    })
    await expect(trigger.scrollWidth).toBeLessThanOrEqual(trigger.clientWidth)
  },
}
