import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { Code, CodeBlock } from './code-block'

type ToolOutputProps = { output: string }

/** A tool call's output under its line in the transcript. */
function ToolOutput({ output }: ToolOutputProps) {
  return (
    <div className="flex w-96 max-w-full flex-col gap-2 rounded-md bg-canvas p-3 text-sm text-ink">
      <p>
        Ran <Code>npm test</Code> in <Code>packages/ui</Code>.
      </p>
      <CodeBlock label="Tool output" copyable>
        {output}
      </CodeBlock>
    </div>
  )
}

const meta = {
  title: 'Components/CodeBlock',
  component: ToolOutput,
  args: { output: 'Test Files  31 passed (31)\n     Tests  142 passed (142)' },
} satisfies Meta<typeof ToolOutput>

export default meta

type Story = StoryObj<typeof meta>

const boxIn = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('pre') as HTMLPreElement

/**
 * Monospace in the 12 px print, in a figure named for what it holds, with a
 * copy button; a block that fits is no tab stop of its own.
 */
export const Default: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const figure = canvas.getByRole('figure', { name: 'Tool output' })
    const box = boxIn(canvasElement)
    await expect(figure).toContainElement(box)
    await expect(getComputedStyle(box).fontFamily).toMatch(/mono/i)
    await expect(getComputedStyle(box).fontSize).toBe('12px')
    await expect(box).not.toHaveAttribute('tabindex')
    await userEvent.tab()
    await expect(
      canvas.getByRole('button', { name: 'Copy code' }),
    ).toHaveFocus()
    await expect(canvas.getByText('npm test').tagName).toBe('CODE')
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
}

/** Long: it scrolls inside itself, past 224 px or its width, and Tab reaches it to scroll. */
export const Long: Story = {
  args: {
    output: Array.from(
      { length: 40 },
      (_, line) =>
        `✓ src/components/part-${line}/part-${line}.stories.tsx (6 tests) ${120 + line} ms — every story rendered, played and checked by axe`,
    ).join('\n'),
  },
  play: async ({ canvasElement, userEvent }) => {
    const box = boxIn(canvasElement)
    await expect(box.getBoundingClientRect().height).toBe(224)
    await expect(box.scrollHeight).toBeGreaterThan(box.clientHeight)
    await expect(box.scrollWidth).toBeGreaterThan(box.clientWidth)
    await userEvent.tab()
    await expect(box).toHaveFocus()
    await expect(getComputedStyle(box).outlineStyle).toBe('solid')
  },
}

/** Wrapped: prose more than code (injected context) wraps its long lines instead of scrolling sideways. */
export const Wrapped: Story = {
  render: () => (
    <div className="w-80 rounded-md bg-canvas p-3">
      <CodeBlock label="Injected context" wrap maxHeight="sm">
        {
          'The Space brief: move every screen onto the shared parts and tokens, then run its stories in light, dark and reduced motion before calling it done.'
        }
      </CodeBlock>
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole('figure', { name: 'Injected context' }),
    ).toBeVisible()
    const box = boxIn(canvasElement)
    await expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth)
    await expect(getComputedStyle(box).whiteSpace).toBe('pre-wrap')
  },
}
