import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

/**
 * The type scale (R4): the sizes the app sets text in, smallest first, each
 * with its utility and its token. text-3xs and text-2xs set the size only:
 * they keep their parent's line height, as text-[10px] and text-[11px] do.
 */
const STEPS = [
  ['3xs', 10, 'Captions, counts, keyboard hints'],
  ['2xs', 11, 'The dense default of every panel'],
  ['xs', 12, 'Secondary lines, menus'],
  ['sm', 14, 'Body text in the conversation'],
  ['base', 16, 'The composer'],
  ['lg', 18, 'Panel titles'],
  ['xl', 20, 'Dialog titles'],
  ['2xl', 24, 'Empty-state headlines'],
] as const

const WEIGHTS = [
  ['font-normal', 'regular', 400],
  ['font-medium', 'medium', 500],
  ['font-semibold', 'semibold', 600],
  ['font-bold', 'bold', 700],
] as const

/** Written out, so Tailwind sees each class. */
const SIZE_CLASS: Record<(typeof STEPS)[number][0], string> = {
  '3xs': 'text-3xs',
  '2xs': 'text-2xs',
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
}

function TypeScale() {
  return (
    <div className="grid w-160 gap-8 bg-canvas p-6 text-ink">
      <section aria-label="Sizes">
        <ul className="grid gap-3">
          {STEPS.map(([step, px, use]) => (
            <li key={step} className="flex items-baseline gap-4">
              <span className="w-40 shrink-0 font-mono text-xs text-ink-muted">
                text-{step} · {px} px
              </span>
              <span data-step={step} className={SIZE_CLASS[step]}>
                {use}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Weights" className="text-sm">
        <ul className="flex flex-wrap gap-6">
          {WEIGHTS.map(([utility, name, weight]) => (
            <li key={utility} data-weight={weight} className={utility}>
              {name} {weight}
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Eyebrow and mono" className="grid gap-2">
        <p
          data-eyebrow
          className="text-2xs font-medium tracking-eyebrow text-ink-muted uppercase"
        >
          Eyebrow: text-2xs, medium, uppercase, tracking-eyebrow
        </p>
        <p className="font-mono text-xs">font-mono: ~/Projects/convergence</p>
      </section>
      <section aria-label="Inherited line height" className="text-xs">
        <p>
          A 12 px line{' '}
          <span data-inherits className="text-2xs text-ink-muted">
            with an 11 px label inside, on the same line height
          </span>
        </p>
      </section>
    </div>
  )
}

const meta = {
  title: 'Foundations/Type',
  component: TypeScale,
} satisfies Meta<typeof TypeScale>

export default meta

type Story = StoryObj<typeof meta>

/** Every size, weight, the eyebrow and the mono face. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    for (const [step, px] of STEPS) {
      const sample = canvasElement.querySelector(`[data-step="${step}"]`)!
      await expect(getComputedStyle(sample).fontSize).toBe(`${px}px`)
    }
    for (const [, , weight] of WEIGHTS) {
      const sample = canvasElement.querySelector(`[data-weight="${weight}"]`)!
      await expect(getComputedStyle(sample).fontWeight).toBe(String(weight))
    }
    // R4: the small steps carry no line height of their own. Inside text-xs
    // an 11 px label keeps xs's ratio (16 / 12), as text-[11px] did.
    const label = canvasElement.querySelector('[data-inherits]')!
    await expect(
      Number.parseFloat(getComputedStyle(label).lineHeight),
    ).toBeCloseTo((11 * 16) / 12, 1)
    const eyebrow = canvasElement.querySelector('[data-eyebrow]')!
    await expect(
      Number.parseFloat(getComputedStyle(eyebrow).letterSpacing),
    ).toBeCloseTo(11 * 0.025, 3)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
