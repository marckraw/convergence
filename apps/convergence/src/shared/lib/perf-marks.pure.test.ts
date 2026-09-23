import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { percentile } from './perf-marks.pure'

describe('performance baseline contract', () => {
  it('uses nearest-rank percentiles without mutating the samples', () => {
    const samples = [40, 10, 30, 20]
    expect(percentile(samples, 0.5)).toBe(20)
    expect(percentile(samples, 0.95)).toBe(40)
    expect(percentile([], 0.95)).toBe(0)
    expect(samples).toEqual([40, 10, 30, 20])
  })

  it('R4 baseline exists, has ten ranked offenders and is linked', () => {
    const docs = resolve('../../docs/architecture')
    const page = readFileSync(resolve(docs, 'perf-baseline-2026-09.md'), 'utf8')
    const links = readFileSync(resolve(docs, 'quick-reference.md'), 'utf8')
    expect(links).toContain('(perf-baseline-2026-09.md)')
    const ranks = [...page.matchAll(/^\| (\d+)\s+\|/gm)].map((match) =>
      Number(match[1]),
    )
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(page).toContain('cost × frequency')
  })
})
