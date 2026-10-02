/** The small framed glyph at a fact's or a metric's top right. */
export const iconChip =
  'shrink-0 rounded-md border border-line bg-canvas p-1.5 text-ink-muted'

/** A placeholder line in a loading skeleton. */
export const skeletonBar = 'rounded bg-surface-muted'

/**
 * Each series' colour, as the chart tokens ChartGPU draws with
 * (chartTokens), so a legend swatch and a bar match their line.
 */
export const seriesFill = {
  1: 'bg-chart-1',
  2: 'bg-chart-2',
  3: 'bg-chart-3',
  4: 'bg-chart-4',
} as const

export type SeriesIndex = keyof typeof seriesFill

/** The heatmap's five levels: none, then the four heat tokens. */
export const heatFill = [
  'bg-surface-muted/40',
  'bg-chart-heat-1',
  'bg-chart-heat-2',
  'bg-chart-heat-3',
  'bg-chart-heat-4',
] as const
