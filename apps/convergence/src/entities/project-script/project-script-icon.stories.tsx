import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import type { ProjectScriptIconId } from './project-script.types'
import { ProjectScriptIcon } from './project-script-icon.presentational'

const ICONS: Array<{ id: ProjectScriptIconId; label: string }> = [
  { id: 'play', label: 'Run' },
  { id: 'check', label: 'Check' },
  { id: 'build', label: 'Build' },
  { id: 'test', label: 'Test' },
  { id: 'wrench', label: 'Fix' },
  { id: 'bug', label: 'Debug' },
]

/** Every icon a project action can wear, each beside what it is for. */
function IconSet() {
  return (
    <ul aria-label="Project action icons" className="grid grid-cols-3 gap-3">
      {ICONS.map(({ id, label }) => (
        <li
          key={id}
          className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
        >
          <ProjectScriptIcon icon={id} className="h-4 w-4" />
          {label}
        </li>
      ))}
    </ul>
  )
}

const meta = {
  title: 'Entities/Project script/Project script icon',
  component: ProjectScriptIcon,
  args: { icon: 'test', className: 'h-4 w-4' },
} satisfies Meta<typeof ProjectScriptIcon>

export default meta

type Story = StoryObj<typeof meta>

/** One icon, drawn as decoration: its action's name says what it is. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const icon = canvasElement.querySelector('svg')
    await expect(icon).toBeVisible()
    await expect(icon).toHaveAttribute('aria-hidden', 'true')
  },
}

/** All six, one per kind of action. */
export const AllIcons: Story = {
  render: () => <IconSet />,
  play: async ({ canvas }) => {
    const list = canvas.getByRole('list', { name: 'Project action icons' })
    await expect(list.querySelectorAll('svg')).toHaveLength(6)
    await expect(canvas.getAllByRole('listitem')).toHaveLength(6)
  },
}

export const Dark: Story = {
  ...AllIcons,
  globals: { theme: 'dark' },
}
