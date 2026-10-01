import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef, useState } from 'react'
import { expect, screen, waitFor, within } from 'storybook/test'
import {
  arrived,
  snapshotWhileAnimating,
} from '../../../.storybook/motion-testing'
import { Button } from '../button/button'
import {
  DialogBody,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../dialog/dialog'
import { Sheet, SheetContent } from './sheet'

type ParallelWorkProps = {
  /** How many tasks the sheet lists. */
  tasks: number
  side?: 'left' | 'right'
}

/** Parallel work, as the conversation shows it when the window is narrow. */
function ParallelWork({ tasks, side }: ParallelWorkProps) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Parallel work · {tasks}
      </Button>
      <SheetContent side={side} size="sm">
        <DialogHeader>
          <DialogTitle>Parallel work</DialogTitle>
          <DialogDescription>
            Tasks this conversation started.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-2">
          {Array.from({ length: tasks }, (_, index) => (
            <Button key={index} variant="ghost" className="justify-start">
              Task {index + 1}: review the migration
            </Button>
          ))}
        </DialogBody>
      </SheetContent>
    </Sheet>
  )
}

const sheetClosed = () =>
  waitFor(() =>
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull(),
  )

const meta = {
  title: 'Components/Sheet',
  component: ParallelWork,
  args: { tasks: 3 },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ParallelWork>

export default meta

type Story = StoryObj<typeof meta>

const open = async (
  canvas: { getByRole: typeof screen.getByRole },
  userEvent: { click: (element: Element) => Promise<void> },
) => {
  const trigger = canvas.getByRole('button', { name: /Parallel work/ })
  await userEvent.click(trigger)
  const sheet = await screen.findByRole('dialog', { name: 'Parallel work' })
  return { trigger, sheet }
}

/**
 * It slides in at the right edge, full height, with the focus inside; Escape
 * closes it and the focus goes back.
 */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const { trigger, sheet } = await open(canvas, userEvent)
    const opening = await snapshotWhileAnimating(sheet, 'translate')
    await expect(opening.running.length).toBeGreaterThan(0)
    await arrived(sheet)
    const box = sheet.getBoundingClientRect()
    await expect(box.right).toBe(window.innerWidth)
    await expect(box.height).toBe(window.innerHeight)
    await waitFor(() =>
      expect(sheet.contains(document.activeElement)).toBe(true),
    )
    await userEvent.keyboard('{Escape}')
    await sheetClosed()
    await expect(trigger).toHaveFocus()
  },
}

/** Tab stays inside, and a press beside it closes it. */
export const FocusTrap: Story = {
  args: { tasks: 1 },
  play: async ({ canvas, userEvent }) => {
    const { sheet } = await open(canvas, userEvent)
    await arrived(sheet)
    const task = within(sheet).getByRole('button', { name: /Task 1/ })
    await waitFor(() => expect(task).toHaveFocus())
    await userEvent.tab()
    await expect(
      within(sheet).getByRole('button', { name: 'Close' }),
    ).toHaveFocus()
    await userEvent.tab()
    await waitFor(() => expect(task).toHaveFocus())
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: document.querySelector<HTMLElement>(
        '[data-slot="sheet-backdrop"]',
      )!,
      coords: { clientX: 4, clientY: 4 },
    })
    await sheetClosed()
  },
}

/** Left: the same sheet from the other edge. */
export const Left: Story = {
  args: { side: 'left' },
  play: async ({ canvas, userEvent }) => {
    const { sheet } = await open(canvas, userEvent)
    await arrived(sheet)
    await expect(sheet.getBoundingClientRect().left).toBe(0)
  },
}

/** Long: the list scrolls inside the sheet; its title stays. */
export const Long: Story = {
  args: { tasks: 40 },
  play: async ({ canvas, userEvent }) => {
    const { sheet } = await open(canvas, userEvent)
    await arrived(sheet)
    await expect(
      within(sheet).getByRole('heading', { name: 'Parallel work' }),
    ).toBeVisible()
    await expect(sheet.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight,
    )
  },
}

/** Over part of a page: inside a dialog's body, with the lighter scrim. */
function SkillDetails() {
  const area = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <div
      ref={area}
      className="relative h-96 w-[40rem] overflow-hidden rounded-xl border border-line"
    >
      <div className="p-4">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Show details
        </Button>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent container={area} size="sm">
          <DialogHeader>
            <DialogTitle>code-review</DialogTitle>
          </DialogHeader>
          <DialogBody>Reviews a diff for correctness.</DialogBody>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export const Contained: Story = {
  render: () => <SkillDetails />,
  parameters: { layout: 'centered' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show details' }))
    const sheet = await screen.findByRole('dialog', { name: 'code-review' })
    await arrived(sheet)
    // It fills the area's height at its right edge, inside its border.
    const area = sheet.closest('.relative')!.getBoundingClientRect()
    const box = sheet.getBoundingClientRect()
    await expect(box.right).toBeLessThanOrEqual(area.right)
    await expect(box.right).toBeGreaterThanOrEqual(area.right - 2)
    await expect(box.height).toBeLessThanOrEqual(area.height)
    await userEvent.keyboard('{Escape}')
    await sheetClosed()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Reduced motion: it fades in at its edge instead of sliding. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async ({ canvas, userEvent }) => {
    const { sheet } = await open(canvas, userEvent)
    const opening = await snapshotWhileAnimating(sheet, 'opacity')
    await expect(opening.opacity).toBeLessThan(1)
    // It stands at its edge: it fades, and does not slide.
    await expect(['none', '0px']).toContain(getComputedStyle(sheet).translate)
    await expect(sheet.getBoundingClientRect().right).toBe(window.innerWidth)
    await arrived(sheet)
  },
}
