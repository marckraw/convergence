import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect } from 'storybook/test'
import { NavTab, NavTabs } from './nav-tabs'

const surfaces = [
  { id: 'conversations', label: 'Conversations' },
  { id: 'mission-control', label: 'Mission Control' },
  { id: 'loom', label: 'Loom' },
]

/** The surface switcher, if it routes: each tab a link to its own place. */
function Surfaces() {
  const [current, setCurrent] = useState('conversations')
  return (
    <NavTabs aria-label="Surfaces">
      {surfaces.map((surface) => (
        <NavTab
          key={surface.id}
          href={`#${surface.id}`}
          current={surface.id === current}
          onClick={(event) => {
            event.preventDefault()
            setCurrent(surface.id)
          }}
        >
          {surface.label}
        </NavTab>
      ))}
    </NavTabs>
  )
}

const meta = {
  title: 'Components/NavTabs',
  component: Surfaces,
} satisfies Meta<typeof Surfaces>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A <nav> of links: the one on screen says aria-current="page" and is the
 * raised chip (R7). Tab moves through them; Enter follows one.
 */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole('navigation', { name: 'Surfaces' }),
    ).toBeVisible()
    const conversations = canvas.getByRole('link', { name: 'Conversations' })
    const loom = canvas.getByRole('link', { name: 'Loom' })
    await expect(conversations).toHaveAttribute('aria-current', 'page')
    await expect(loom).not.toHaveAttribute('aria-current')
    await expect(getComputedStyle(conversations).boxShadow).not.toBe('none')
    await expect(getComputedStyle(loom).boxShadow).toBe('none')
    await userEvent.tab()
    await userEvent.tab()
    await userEvent.tab()
    await expect(loom).toHaveFocus()
    await expect(getComputedStyle(loom).outlineStyle).toBe('solid')
    await userEvent.keyboard('{Enter}')
    await expect(loom).toHaveAttribute('aria-current', 'page')
    await expect(conversations).not.toHaveAttribute('aria-current')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
