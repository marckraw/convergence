import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { SpaceDraftContext } from './space-draft-context.presentational'

const preview = [
  '<space_context>',
  'Space: Design system sweep',
  'Space brief:\nMove every screen onto @convergence/ui parts and tokens.',
  'Selected Space sources:\n- audit.md: /spaces/space-ds/sources/audit.md',
  '</space_context>',
].join('\n\n')

const meta = {
  title: 'Widgets/ChatSurface/SpaceDraftContext',
  component: SpaceDraftContext,
  args: {
    selection: {
      includeBrief: true,
      includeMemory: false,
      selectedSourceIds: ['source-audit'],
    },
    sources: [
      { id: 'source-audit', filename: 'audit.md' },
      { id: 'source-figma', filename: 'figma-export.png' },
    ],
    preview,
    onChange: fn(),
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof SpaceDraftContext>

export default meta

type Story = StoryObj<typeof meta>

/** What a chat started in a Space takes with it, and the block that makes. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('checkbox', { name: 'Space brief' }),
    ).toBeChecked()
    await expect(
      canvas.getByRole('checkbox', { name: 'audit.md' }),
    ).toBeChecked()
    await userEvent.click(
      canvas.getByRole('checkbox', { name: 'figma-export.png' }),
    )
    await expect(args.onChange).toHaveBeenCalledWith({
      includeBrief: true,
      includeMemory: false,
      selectedSourceIds: ['source-audit', 'source-figma'],
    })
    await userEvent.click(
      canvas.getByRole('checkbox', { name: 'Space memory/instructions' }),
    )
    await expect(args.onChange).toHaveBeenLastCalledWith({
      includeBrief: true,
      includeMemory: true,
      selectedSourceIds: ['source-audit'],
    })
  },
}

/** Nothing chosen: no sources to pick, and the preview says so. */
export const Empty: Story = {
  args: {
    selection: {
      includeBrief: false,
      includeMemory: false,
      selectedSourceIds: [],
    },
    sources: [],
    preview: null,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No Space context selected.')).toBeVisible()
    await expect(canvas.queryByText('Selected sources')).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
