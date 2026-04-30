import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChartGPUOptions } from 'chartgpu-react'
import { ChartGpuChart, isChartGpuSupported } from './chartgpu-chart.container'

vi.mock('chartgpu-react', () => ({
  ChartGPU: vi.fn(({ className, style }) => (
    <div data-testid="chartgpu" className={className} style={style} />
  )),
}))

const options: ChartGPUOptions = {
  series: [{ type: 'line', data: [{ x: 0, y: 1 }] }],
  xAxis: { type: 'value' },
  yAxis: { type: 'value' },
}

function setWebGpuSupport(supported: boolean): void {
  if (supported) {
    Object.defineProperty(navigator, 'gpu', {
      value: {},
      configurable: true,
    })
  } else {
    Reflect.deleteProperty(navigator, 'gpu')
  }
}

describe('ChartGpuChart', () => {
  beforeEach(() => {
    setWebGpuSupport(false)
  })

  it('detects WebGPU support from navigator.gpu', () => {
    expect(isChartGpuSupported()).toBe(false)

    setWebGpuSupport(true)

    expect(isChartGpuSupported()).toBe(true)
  })

  it('renders the fallback when WebGPU is unavailable', () => {
    render(
      <ChartGpuChart
        options={options}
        fallbackTitle="No WebGPU"
        fallbackDescription="Use another renderer."
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('No WebGPU')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Use another renderer.',
    )
    expect(screen.queryByTestId('chartgpu')).toBeNull()
  })

  it('renders ChartGPU when WebGPU is available', () => {
    setWebGpuSupport(true)

    render(
      <ChartGpuChart
        options={options}
        className="analytics-chart"
        height={320}
      />,
    )

    const chart = screen.getByTestId('chartgpu')
    expect(chart).toHaveClass('analytics-chart')
    expect(chart).toHaveStyle({ height: '320px', width: '100%' })
  })
})
