import type { Meta, StoryObj } from '@storybook/react-vite'
import { FileText, Library } from 'lucide-react'
import { useState } from 'react'
import { expect, screen } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { Chip } from './chip'

const ATTACHED = ['plan.pdf', 'tokens.css', 'notes.md']

/** The composer's attachments, each removable. */
function Attachments() {
  const [files, setFiles] = useState(ATTACHED)
  return (
    <div className="flex w-96 flex-wrap gap-1.5 rounded-md bg-canvas p-3">
      {files.map((file) => (
        <Chip
          key={file}
          icon={<FileText />}
          removeLabel={`Remove ${file}`}
          onRemove={() =>
            setFiles((all) => all.filter((each) => each !== file))
          }
        >
          {file}
        </Chip>
      ))}
      <Chip icon={<Library />} tone="info">
        frontend-design
      </Chip>
    </div>
  )
}

const meta = {
  title: 'Components/Chip',
  component: Attachments,
} satisfies Meta<typeof Attachments>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Each chip names its item; its ✕ says what it removes, takes it off with a
 * click, and is reachable by Tab.
 */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const chip = canvas.getByText('plan.pdf').closest('[data-slot="chip"]')
    await expect(getComputedStyle(chip as Element).color).toBe(
      tokenColor('--ink-muted'),
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove plan.pdf' }),
    )
    await expect(canvas.queryByText('plan.pdf')).toBeNull()
    await userEvent.tab()
    const next = canvas.getByRole('button', { name: 'Remove tokens.css' })
    await expect(next).toHaveFocus()
    await expect(getComputedStyle(next).outlineStyle).toBe('solid')
    // The ✕ is an IconButton: its name is its tooltip too (R2).
    await expect(
      await screen.findByRole('tooltip', {}, { timeout: 2000 }),
    ).toHaveTextContent('Remove tokens.css')
    await userEvent.keyboard('{Enter}')
    await expect(canvas.queryByText('tokens.css')).toBeNull()
    // No Delete-key promise: the name is the item's, nothing more.
    await expect(
      canvas.getByRole('button', { name: 'Remove notes.md' }),
    ).not.toHaveAccessibleName(/Delete/)
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    const skill = canvas
      .getByText('frontend-design')
      .closest('[data-slot="chip"]') as Element
    await expect(getComputedStyle(skill).color).toBe(tokenColor('--info-ink'))
  },
}

/** Long: a long name is cut short at 192 px; its ✕ stays whole beside it. */
export const Long: Story = {
  render: () => (
    <div className="w-96 rounded-md bg-canvas p-3">
      <Chip
        icon={<FileText />}
        removeLabel="Remove the screenshot"
        onRemove={() => undefined}
      >
        screenshot-of-the-settings-dialog-in-the-light-theme-before-ds4.png
      </Chip>
    </div>
  ),
  play: async ({ canvas }) => {
    const name = canvas.getByText(/screenshot-of/)
    await expect(name.getBoundingClientRect().width).toBe(192)
    await expect(getComputedStyle(name).textOverflow).toBe('ellipsis')
    const remove = canvas.getByRole('button', { name: 'Remove the screenshot' })
    await expect(remove.getBoundingClientRect().width).toBe(24)
  },
}

/** Missing: a file that moved away, on a dashed edge. */
export const Missing: Story = {
  render: () => (
    <div className="w-96 rounded-md bg-canvas p-3">
      <Chip icon={<FileText />} dashed>
        old-plan.pdf (missing)
      </Chip>
    </div>
  ),
  play: async ({ canvas }) => {
    const chip = canvas
      .getByText('old-plan.pdf (missing)')
      .closest('[data-slot="chip"]') as Element
    await expect(getComputedStyle(chip).borderTopStyle).toBe('dashed')
  },
}
