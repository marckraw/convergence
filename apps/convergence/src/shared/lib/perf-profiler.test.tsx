import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PerfProfiler } from './perf-profiler'

const flag = vi.hoisted(() => ({ enabled: false, mounts: 0 }))
vi.mock('./perf.api', () => ({ perfApi: { isEnabled: () => flag.enabled } }))
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>()
  return {
    ...react,
    Profiler: ({ children }: { children: React.ReactNode }) => {
      flag.mounts++
      return children
    },
  }
})

describe('PerfProfiler flag boundary', () => {
  beforeEach(() => {
    flag.enabled = false
    flag.mounts = 0
  })
  it('returns the identical child and mounts no Profiler when off', () => {
    const child = <textarea aria-label="composer" />
    expect(PerfProfiler({ id: 'composer', children: child })).toBe(child)
    render(<PerfProfiler id="composer">{child}</PerfProfiler>)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(flag.mounts).toBe(0)
  })
  it('mounts the Profiler when on', () => {
    flag.enabled = true
    render(
      <PerfProfiler id="sidebar">
        <div>list</div>
      </PerfProfiler>,
    )
    expect(flag.mounts).toBe(1)
  })
})
