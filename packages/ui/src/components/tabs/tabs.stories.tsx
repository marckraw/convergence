import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, waitFor } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { cn } from '#lib/cn.pure'
import { ThemeScope } from '../theme-scope/theme-scope'
import { Tabs, TabsList, TabsPanel, TabsTab, type TabsVariant } from './tabs'

type Doc = { id: string; title: string }

type DocumentTabsProps = {
  variant: TabsVariant
  docs: Doc[]
  /** A strip in a dark ThemeScope, as the terminal dock has it (R12). */
  terminal?: boolean
  onValueChange: (value: string) => void
  onClose: (id: string) => void
}

/** Tabs over their panels: Insights' views, or the terminal's open shells. */
function DocumentTabs({
  variant,
  docs,
  terminal,
  onValueChange,
  onClose,
}: DocumentTabsProps) {
  const [value, setValue] = useState(docs[0]?.id)
  const tabs = (
    <Tabs
      variant={variant}
      value={value}
      onValueChange={(next: string) => {
        setValue(next)
        onValueChange(next)
      }}
      className={
        variant === 'strip'
          ? cn(
              'w-96 max-w-full gap-0 border-b border-line-soft px-1 py-1',
              terminal && 'bg-terminal-strip',
            )
          : 'w-96 max-w-full'
      }
    >
      <TabsList aria-label="Open documents" className="overflow-hidden">
        {docs.map((doc) => (
          <TabsTab
            key={doc.id}
            value={doc.id}
            onClose={variant === 'strip' ? () => onClose(doc.id) : undefined}
            closeLabel={`Close ${doc.title}`}
          >
            {doc.title}
          </TabsTab>
        ))}
      </TabsList>
      {variant === 'segmented'
        ? docs.map((doc) => (
            <TabsPanel key={doc.id} value={doc.id} className="text-sm">
              {doc.title}: the panel.
            </TabsPanel>
          ))
        : null}
    </Tabs>
  )
  return terminal ? (
    <ThemeScope theme="dark" className="bg-terminal-bg pb-16">
      {tabs}
    </ThemeScope>
  ) : (
    tabs
  )
}

const meta = {
  title: 'Components/Tabs',
  component: DocumentTabs,
  args: {
    variant: 'segmented',
    docs: [
      { id: 'usage', title: 'Usage' },
      { id: 'profile', title: 'Profile' },
      { id: 'models', title: 'Models' },
    ],
    onValueChange: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof DocumentTabs>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Segmented: the open tab is the raised chip (R7). Tab reaches the open tab,
 * the arrows move along, Enter opens; the open tab says aria-selected and
 * shows its panel.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const usage = canvas.getByRole('tab', { name: 'Usage' })
    const profile = canvas.getByRole('tab', { name: 'Profile' })
    await expect(usage).toHaveAttribute('aria-selected', 'true')
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent('Usage')
    await userEvent.tab()
    await expect(usage).toHaveFocus()
    await expect(getComputedStyle(usage).outlineStyle).toBe('solid')
    await userEvent.keyboard('{ArrowRight}')
    await expect(profile).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(profile).toHaveAttribute('aria-selected', 'true')
    await expect(usage).toHaveAttribute('aria-selected', 'false')
    await expect(args.onValueChange).toHaveBeenLastCalledWith('profile')
    // The panel before fades out first, then leaves.
    await waitFor(() =>
      expect(canvas.getByRole('tabpanel')).toHaveTextContent('Profile'),
    )
  },
}

/**
 * Strip: document tabs, each closable. Its ✕ shows when the pointer or the
 * keyboard reaches the tab; Delete on the focused tab closes it.
 */
export const Strip: Story = {
  args: {
    variant: 'strip',
    docs: [
      { id: 'zsh-1', title: 'zsh' },
      { id: 'zsh-2', title: 'npm run test' },
    ],
  },
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const first = canvas.getByRole('tab', { name: 'zsh' })
    const second = canvas.getByRole('tab', { name: 'npm run test' })
    await expect(first).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(second)
    await expect(second).toHaveAttribute('aria-selected', 'true')
    await expect(args.onValueChange).toHaveBeenLastCalledWith('zsh-2')

    await userEvent.keyboard('{ArrowLeft}')
    await expect(first).toHaveFocus()
    await expect(getComputedStyle(first).outlineStyle).toBe('solid')
    await expect(first).toHaveAttribute('aria-keyshortcuts', 'Delete')
    const closeSlot = first.parentElement?.querySelector(
      '[data-slot="tabs-close"]',
    )
    if (!closeSlot) throw new Error('the tab has no close')
    await waitFor(() =>
      expect(Number(getComputedStyle(closeSlot).opacity)).toBe(1),
    )
    await userEvent.keyboard('{Delete}')
    await expect(args.onClose).toHaveBeenLastCalledWith('zsh-1')

    const closeSecond = canvasElement.querySelector<HTMLElement>(
      '[aria-label="Close npm run test"]',
    )
    if (!closeSecond) throw new Error('no close on the second tab')
    await userEvent.click(closeSecond)
    await expect(args.onClose).toHaveBeenLastCalledWith('zsh-2')
  },
}

/**
 * Terminal (R12): in the light theme, the strip in its dark ThemeScope stays
 * dark; the open tab wears the dark canvas.
 */
export const Terminal: Story = {
  args: {
    ...Strip.args,
    variant: 'strip',
    terminal: true,
  },
  play: async ({ canvas, canvasElement }) => {
    const scope = canvasElement.querySelector('[data-theme="dark"]')
    if (!scope) throw new Error('no dark scope')
    const open = canvas.getByRole('tab', { name: 'zsh' })
      .parentElement as HTMLElement
    await expect(getComputedStyle(open).backgroundColor).toBe(
      tokenColor('--canvas', scope),
    )
    await expect(tokenColor('--canvas', scope)).not.toBe(tokenColor('--canvas'))
  },
}

/** Long: more tabs than fit share the strip, each cut short on one line. */
export const Long: Story = {
  args: {
    variant: 'strip',
    docs: Array.from({ length: 9 }, (_, index) => ({
      id: `tab-${index}`,
      title: `npm run test -- --watch packages/ui ${index + 1}`,
    })),
  },
  play: async ({ canvas }) => {
    const list = canvas.getByRole('tablist', { name: 'Open documents' })
    await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth)
    const words = canvas.getByText('npm run test -- --watch packages/ui 1')
    await expect(getComputedStyle(words).textOverflow).toBe('ellipsis')
    await expect(words.scrollWidth).toBeGreaterThan(words.clientWidth)
    const first = canvas.getAllByRole('tab')[0] as HTMLElement
    await expect(first.getBoundingClientRect().height).toBeLessThan(24)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
