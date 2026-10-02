import type { Meta, StoryObj } from '@storybook/react-vite'
import { PanelLeft, Settings } from 'lucide-react'
import { expect, screen } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { IconButton } from '../icon-button/icon-button'
import { StatusPill } from '../status-pill/status-pill'
import { DragRegion, ScreenHeader } from './screen-header'

/** How Electron will treat an element: the window's drag region, or not. */
const appRegion = (element: Element) => {
  const style = getComputedStyle(element)
  return (
    style.getPropertyValue('app-region') ||
    style.getPropertyValue('-webkit-app-region')
  )
}

type MissionControlTopProps = { title: string }

/** Mission Control's top strip, with a toggle at its start and settings at its end. */
function MissionControlTop({ title }: MissionControlTopProps) {
  return (
    <div className="w-160 max-w-full bg-canvas">
      <ScreenHeader
        start={
          <IconButton label="Show the sidebar" size="sm" variant="quiet">
            <PanelLeft />
          </IconButton>
        }
        title={title}
        subtitle="3 sessions working"
        end={
          <IconButton
            label="Mission Control settings"
            size="sm"
            variant="quiet"
          >
            <Settings />
          </IconButton>
        }
      />
    </div>
  )
}

const meta = {
  title: 'Components/ScreenHeader',
  component: MissionControlTop,
  args: { title: 'Mission Control' },
} satisfies Meta<typeof MissionControlTop>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A 48 px strip with a hairline under it; its heading names the screen. The
 * strip drags the window, and its slots don't, so their controls click.
 */
export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    const heading = canvas.getByRole('heading', {
      level: 1,
      name: 'Mission Control',
    })
    await expect(heading).toBeVisible()
    const header = canvasElement.querySelector(
      '[data-slot="screen-header"]',
    ) as HTMLElement
    const row = header.firstElementChild as HTMLElement
    await expect(row.getBoundingClientRect().height).toBe(48)
    await expect(getComputedStyle(header).borderBottomColor).toBe(
      tokenColor('--line'),
    )
    await expect(appRegion(header)).toBe('drag')
    // A title that fits stays part of the drag region.
    await expect(appRegion(heading)).not.toBe('no-drag')
    for (const name of ['Show the sidebar', 'Mission Control settings']) {
      const slot = canvas.getByRole('button', { name }).parentElement as Element
      await expect(appRegion(slot)).toBe('no-drag')
    }
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
}

/** Long: the title is cut short; the slots keep their place. */
export const Long: Story = {
  args: {
    title:
      'Mission Control for every crew, every lane and every session this week, last week and the week before that',
  },
  play: async ({ args, canvas, userEvent }) => {
    const heading = canvas.getByRole('heading', { level: 1 })
    await expect(getComputedStyle(heading).textOverflow).toBe('ellipsis')
    await expect(heading.scrollWidth).toBeGreaterThan(heading.clientWidth)
    await expect(
      canvas.getByRole('button', { name: 'Mission Control settings' }),
    ).toBeVisible()
    // Cut short, it leaves the drag region so the pointer reaches it, and
    // shows whole in our Tooltip (R2).
    await expect(appRegion(heading)).toBe('no-drag')
    await userEvent.hover(heading)
    await expect(
      await screen.findByRole('tooltip', {}, { timeout: 2000 }),
    ).toHaveTextContent(args.title)
  },
}

/** WithRows: status rows under the 48 px row, inside the header, as a panel's h2. */
export const WithRows: Story = {
  render: () => (
    <div className="w-160 max-w-full bg-canvas">
      <ScreenHeader title="Rewrite the importer" headingLevel={2}>
        <div className="flex items-center gap-1.5 pb-2">
          <StatusPill tone="info">Remote</StatusPill>
          <StatusPill>Edited 2 files</StatusPill>
        </div>
      </ScreenHeader>
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Rewrite the importer' }),
    ).toBeVisible()
    const header = canvasElement.querySelector(
      '[data-slot="screen-header"]',
    ) as HTMLElement
    await expect(header).toContainElement(canvas.getByText('Remote'))
    await expect(header.getBoundingClientRect().height).toBeGreaterThan(48)
  },
}

/**
 * WithBar: a row its owner lays out, as the conversation header does, with
 * its controls on both sides. The header still draws the strip and owns the
 * drag: the row's empty space moves the window, its groups don't.
 */
export const WithBar: Story = {
  render: () => (
    <div className="w-160 max-w-full bg-canvas">
      <ScreenHeader
        bar={
          <>
            <div
              data-testid="identity"
              className="app-no-drag flex min-w-0 items-center gap-1.5 text-sm"
            >
              <span className="truncate text-ink-muted">convergence</span>
              <span aria-hidden className="text-ink-muted">
                /
              </span>
              <span className="truncate font-medium">Rewrite the importer</span>
            </div>
            <div className="app-no-drag ml-auto flex shrink-0 items-center gap-1.5">
              <IconButton label="Session settings" size="sm" variant="quiet">
                <Settings />
              </IconButton>
            </div>
          </>
        }
      />
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    const header = canvasElement.querySelector(
      '[data-slot="screen-header"]',
    ) as HTMLElement
    const row = header.firstElementChild as HTMLElement
    await expect(row.getBoundingClientRect().height).toBe(48)
    await expect(appRegion(header)).toBe('drag')
    await expect(appRegion(row)).not.toBe('no-drag')
    await expect(appRegion(canvas.getByTestId('identity'))).toBe('no-drag')
    await expect(
      appRegion(canvas.getByRole('button', { name: 'Session settings' })),
    ).toBe('no-drag')
    // The owner's row stands in for the slots: no heading of the part's own.
    await expect(canvas.queryByRole('heading')).toBeNull()
  },
}

export const WithBarDark: Story = {
  ...WithBar,
  globals: { theme: 'dark' },
}

/** DragRegion: the bare strip for a screen with no header. */
export const BareDragRegion: Story = {
  render: () => (
    <div className="flex h-40 w-80 flex-col bg-canvas">
      <DragRegion />
      <p className="m-auto text-sm text-ink-muted">Loading Convergence…</p>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const strip = canvasElement.querySelector(
      '[data-slot="drag-region"]',
    ) as HTMLElement
    await expect(strip.getBoundingClientRect().height).toBe(48)
    await expect(appRegion(strip)).toBe('drag')
  },
}
