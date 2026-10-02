import type { Meta, StoryObj } from '@storybook/react-vite'
import { metaName, metaText } from '@/shared/testing/meta-line'
import { expect } from 'storybook/test'
import { CompactionMarker } from './compaction-marker.presentational'

const meta = {
  title: 'Widgets/SessionView/CompactionMarker',
  component: CompactionMarker,
  args: {
    fact: {
      kind: 'harness.compaction',
      at: '2026-10-01T14:12:40.000Z',
      sequence: 41,
      trigger: 'auto',
      preTokens: 167_400,
      postTokens: 12_300,
      durationMs: 8_200,
    },
  },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-144 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CompactionMarker>

export default meta

type Story = StoryObj<typeof meta>

/** A line across the transcript where the harness compacted the context. */
export const Default: Story = {
  play: async ({ canvas }) => {
    // Named by its facts, which a MetaLine joins (CONV-23): a screen reader
    // hears a comma where the eye reads a dot.
    await expect(
      canvas.getByRole('separator', {
        name: metaName('Compacted (auto) · 167.4k → 12.3k tokens'),
      }),
    ).toBeVisible()
    await expect(
      canvas.getByText(metaText('Compacted (auto) · 167.4k → 12.3k tokens')),
    ).toBeVisible()
  },
}

/** A manual /compact that reported only the size before, from a cut record. */
export const Long: Story = {
  args: {
    fact: {
      kind: 'harness.compaction',
      at: '2026-10-01T14:12:40.000Z',
      sequence: 42,
      truncated: true,
      fieldBounds: { trigger: { truncated: true, bytes: 4096 } },
      trigger: 'manual',
      preTokens: 98_000,
      postTokens: null,
      durationMs: null,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        metaText(
          'Compacted (manual) · 98k tokens before · record truncated · text truncated',
        ),
      ),
    ).toBeVisible()
  },
}

/** Nothing reported but the fact itself. */
export const Empty: Story = {
  args: {
    fact: {
      kind: 'harness.compaction',
      at: '2026-10-01T14:12:40.000Z',
      sequence: 43,
      trigger: null,
      preTokens: null,
      postTokens: null,
      durationMs: null,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('separator')).toHaveTextContent(
      'Compacted (not reported)',
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
