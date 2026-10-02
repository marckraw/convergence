/*
 * The chart palette (MAR-3617 DS4), for ChartGPU, which draws on the GPU and
 * can't read CSS. One value in both themes. They mirror the --chart-* tokens in
 * tokens.css, and mirrors.tokens.test.ts fails if the two drift apart. ChartGPU
 * reads hex and comma rgba() only, so the grid stays in the comma form.
 */
export const chartTokens = {
  /** --chart-1 … --chart-5, the series in order */
  series: ['#2563eb', '#14b8a6', '#f59e0b', '#7c3aed', '#ef4444'],
  /** --chart-grid, grid and axis lines */
  grid: 'rgba(148, 163, 184, 0.22)',
} as const
