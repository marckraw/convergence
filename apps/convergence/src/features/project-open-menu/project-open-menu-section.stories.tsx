import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, within } from 'storybook/test'
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@convergence/ui'
import type { ProjectOpenApp } from '@/entities/project-open'
import { ProjectOpenMenuSection } from './project-open-menu-section.presentational'

type SectionProps = ComponentProps<typeof ProjectOpenMenuSection>

const apps: ProjectOpenApp[] = [
  { id: 'cursor', label: 'Cursor', kind: 'editor' },
  { id: 'vscode', label: 'VS Code', kind: 'editor' },
  { id: 'zed', label: 'Zed', kind: 'editor' },
  { id: 'finder', label: 'Finder', kind: 'file-manager' },
]

/**
 * The section as the header's Project panel holds it (a Popover since
 * MAR-3616): other tools above, the Open in group below a line. Open from
 * the start, so the story rests on the section itself.
 */
const InProjectMenu = (props: SectionProps) => (
  <Popover defaultOpen>
    <PopoverTrigger render={<Button variant="ghost" />}>
      convergence
    </PopoverTrigger>
    <PopoverContent
      aria-label="Project"
      align="start"
      className="min-w-52 p-1.5"
    >
      <Button variant="ghost" className="w-full justify-start font-normal">
        Project settings…
      </Button>
      <div className="my-1 h-px bg-surface-muted" />
      <ProjectOpenMenuSection {...props} />
    </PopoverContent>
  </Popover>
)

const meta = {
  title: 'Features/ProjectOpenMenu/ProjectOpenMenuSection',
  component: ProjectOpenMenuSection,
  render: (args) => <InProjectMenu {...args} />,
  args: {
    apps,
    loading: false,
    disabledReason: null,
    onOpen: fn(),
  },
} satisfies Meta<typeof ProjectOpenMenuSection>

export default meta

type Story = StoryObj<typeof meta>

/** One button per app, each named for where it opens, in a group named Open in. */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const group = await screen.findByRole('group', { name: 'Open in' })
    const items = within(group).getAllByRole('button')
    await expect(items).toHaveLength(4)
    await userEvent.click(
      within(group).getByRole('button', { name: 'Open in Zed' }),
    )
    await expect(args.onOpen).toHaveBeenCalledWith(apps[2])
  },
}

/** Busy: the apps are still being detected, so the one line says so. */
export const Busy: Story = {
  args: { loading: true },
  play: async () => {
    const group = await screen.findByRole('group', { name: 'Open in' })
    await expect(group).toHaveTextContent('Detecting apps…')
    await expect(within(group).queryAllByRole('button')).toHaveLength(0)
  },
}

/** Disabled: no project path, so the one line says why nothing can open. */
export const Disabled: Story = {
  args: { disabledReason: 'This project has no folder on disk' },
  play: async () => {
    const group = await screen.findByRole('group', { name: 'Open in' })
    await expect(group).toHaveTextContent('This project has no folder on disk')
    await expect(within(group).queryAllByRole('button')).toHaveLength(0)
  },
}

/** Empty: no app was found, so the group holds only its label. */
export const Empty: Story = {
  args: { apps: [] },
  play: async () => {
    const group = await screen.findByRole('group', { name: 'Open in' })
    await expect(within(group).queryAllByRole('button')).toHaveLength(0)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
