import type { Meta, StoryObj } from '@storybook/react-vite'
import { GitPullRequest } from 'lucide-react'
import { expect, fn } from 'storybook/test'
import { Card } from '../card/card'
import { SectionLabel } from '../section-label/section-label'
import { PanelHeader, SidePanel, SidePanelBody } from './side-panel'

type PullRequestPanelProps = {
  title: string
  sections: number
  onClose: () => void
}

/** The PR panel beside a conversation. */
function PullRequestPanel({ title, sections, onClose }: PullRequestPanelProps) {
  return (
    <div className="flex h-96 justify-end bg-canvas">
      <SidePanel>
        <PanelHeader
          icon={<GitPullRequest />}
          title={title}
          onClose={onClose}
        />
        <SidePanelBody>
          {Array.from({ length: sections }, (_, index) => (
            <section key={index} className="space-y-1.5">
              <SectionLabel as="h3">Check {index + 1}</SectionLabel>
              <Card>
                <p className="text-sm">Typecheck passed.</p>
              </Card>
            </section>
          ))}
        </SidePanelBody>
      </SidePanel>
    </div>
  )
}

const meta = {
  title: 'Components/SidePanel',
  component: PullRequestPanel,
  args: { title: 'Pull request', sections: 2, onClose: fn() },
} satisfies Meta<typeof PullRequestPanel>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A 320 px column named by its header's title; the 48 px header has a
 * 28 px ✕ named "Close".
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const panel = canvas.getByRole('complementary', { name: 'Pull request' })
    await expect(panel.getBoundingClientRect().width).toBe(320)
    const close = canvas.getByRole('button', { name: 'Close' })
    await expect(close.getBoundingClientRect().height).toBe(28)
    await userEvent.click(close)
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
}

/** Long: the title is cut short; the body scrolls under a header that stays put. */
export const Long: Story = {
  args: {
    title: 'Pull request #917: the tokens, every value in tokens.css',
    sections: 8,
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const title = canvas.getByRole('heading', { level: 2 })
    await expect(getComputedStyle(title).textOverflow).toBe('ellipsis')
    await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
    const body = canvasElement.querySelector(
      '[data-slot="side-panel-body"]',
    ) as HTMLElement
    await expect(body.scrollHeight).toBeGreaterThan(body.clientHeight)
    await expect(getComputedStyle(body).overflowY).toBe('auto')
    // The keyboard reaches it after the header's ✕, to scroll it.
    await userEvent.tab()
    await userEvent.tab()
    await expect(body).toHaveFocus()
  },
}
