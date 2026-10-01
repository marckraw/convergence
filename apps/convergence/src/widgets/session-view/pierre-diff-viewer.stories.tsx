import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, waitFor } from 'storybook/test'
import { PierreDiffViewerView } from './pierre-diff-viewer.presentational'

/** A hunk as git stores it, with more context than the viewer shows at first. */
const hunk = [
  '@@ -12,19 +12,20 @@ export function SkillPicker({',
  '   const [query, setQuery] = useState("")',
  '   const listRef = useRef<HTMLDivElement>(null)',
  '   const filtered = useMemo(',
  '     () => filterSkills(skills, query),',
  '     [skills, query],',
  '   )',
  ' ',
  '   return (',
  '     <Popover open={open} onOpenChange={onOpenChange}>',
  '-      <PopoverContent align="start">',
  '-        <SkillList skills={filtered} onPick={onPick} />',
  '+      <PopoverContent',
  '+        align="start"',
  '+        onCloseAutoFocus={(event) => event.preventDefault()}',
  '+      >',
  '+        <SkillList ref={listRef} skills={filtered} onPick={onPick} />',
  '       </PopoverContent>',
  '     </Popover>',
  '   )',
  ' }',
  ' ',
  ' export default SkillPicker',
].join('\n')

const knownDiffIssues = {
  a11y: {
    config: {
      rules: [
        // a11y-known: the diff's syntax theme draws tokens (pink, purple, teal, orange) under 4.5:1 on the line backgrounds, in both themes — fixed by the sweep (DS4)
        { id: 'color-contrast', enabled: false },
        // a11y-known: the diff's code panes scroll sideways but neither they nor anything in them can take focus, so a keyboard cannot scroll them — fixed by the sweep (DS4)
        { id: 'scrollable-region-focusable', enabled: false },
      ],
    },
  },
}

const meta = {
  title: 'Widgets/SessionView/PierreDiffViewer',
  component: PierreDiffViewerView,
  args: {
    file: 'apps/convergence/src/features/composer/skill-picker.presentational.tsx',
    diff: hunk,
    status: 'M',
    subtitle: 'Turn 4',
    onExpandContextBefore: fn(),
    onExpandContextAfter: fn(),
    onExpandContextBoth: fn(),
    onResetContext: fn(),
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-[32rem] w-[48rem] max-w-full bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PierreDiffViewerView>

export default meta

type Story = StoryObj<typeof meta>

/** A file's diff, with three lines of context and controls for more. */
export const Default: Story = {
  parameters: knownDiffIssues,
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText(args.file ?? '')).toBeVisible()
    const above = canvas.getByRole('button', {
      name: 'Show more context above changes',
    })
    await expect(above).toBeEnabled()
    await userEvent.click(above)
    await expect(args.onExpandContextBefore).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Show more context above and below changes',
      }),
    )
    await expect(args.onExpandContextBoth).toHaveBeenCalledOnce()
    // Nothing expanded yet, so there is nothing to reset.
    await expect(
      canvas.getByRole('button', { name: 'Reset visible diff context' }),
    ).toBeDisabled()
  },
}

/** Context widened: Reset brings it back to three lines. */
export const Expanded: Story = {
  parameters: knownDiffIssues,
  args: { contextBefore: 23, contextAfter: 23 },
  play: async ({ args, canvas, userEvent }) => {
    const reset = canvas.getByRole('button', {
      name: 'Reset visible diff context',
    })
    await expect(reset).toBeEnabled()
    await userEvent.click(reset)
    await expect(args.onResetContext).toHaveBeenCalledOnce()
    await expect(
      canvas.getByRole('button', { name: 'Show more context above changes' }),
    ).toBeDisabled()
  },
}

/** No file chosen yet. */
export const Empty: Story = {
  args: { file: null },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        'Select a changed file to inspect its working tree diff.',
      ),
    ).toBeVisible()
  },
}

/** Loading the diff. */
export const Busy: Story = {
  args: { diff: '', loading: true },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText('Loading diff...')).toBeVisible()
    await expect(
      canvasElement.querySelector('[aria-busy="true"]'),
    ).not.toBeNull()
  },
}

/** A stored change with no hunks (a binary file): its text, as it is. */
export const Failed: Story = {
  args: {
    file: 'apps/convergence/build/icon.icns',
    diff: 'Binary files a/apps/convergence/build/icon.icns and b/apps/convergence/build/icon.icns differ',
    status: 'M',
  },
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(canvas.getByText(/Binary files a\/apps/)).toBeVisible(),
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
