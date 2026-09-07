import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Position, type EdgeProps } from '@xyflow/react'
import { CanvasRoutedEdge } from './canvas-routed-edge.container'
const routing = vi.hoisted(() => ({
  route: vi.fn(
    (): { points: { x: number; y: number }[]; shared: boolean } | null => null,
  ),
}))

vi.mock('@xyflow/react', async (original) => ({
  ...(await original<typeof import('@xyflow/react')>()),
  useNodes: () => [
    { id: 'a', position: { x: 20, y: 44 }, width: 260, height: 108 },
    { id: 'b', position: { x: 20, y: 340 }, width: 260, height: 108 },
  ],
  BaseEdge: ({ path }: { path: string }) => (
    <svg>
      <path data-testid="route" d={path} />
    </svg>
  ),
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))
vi.mock('@/features/mission-control', async (original) => ({
  ...(await original<typeof import('@/features/mission-control')>()),
  routeAround: () => null,
  routeCanvasEdge: routing.route,
}))

describe('F1 fallback', () => {
  it.each([false, true])(
    'G2′ stacks shared-route label %s (mutation: omit shared label layout)',
    (reverse) => {
      const points = [
        { x: 150, y: 152 },
        { x: 150, y: 246 },
        { x: 400, y: 246 },
        { x: 400, y: 340 },
      ]
      routing.route.mockReturnValueOnce({
        points: reverse ? points.slice().reverse() : points,
        shared: true,
      })
      const { getByText } = render(
        <CanvasRoutedEdge
          {...({
            id: 'wire',
            source: reverse ? 'b' : 'a',
            target: reverse ? 'a' : 'b',
            sourceX: 0,
            sourceY: 0,
            targetX: 0,
            targetY: 0,
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            data: { opposed: true },
            label: 'Shared label',
          } as EdgeProps)}
        />,
      )
      expect(getByText('Shared label')).toHaveStyle({
        transform: `translate(-50%, ${reverse ? '0%' : '-100%'}) translate(275px, ${reverse ? 249 : 243}px)`,
      })
    },
  )

  it('uses a side-selected smoothstep (mutation: restore the straight fallback)', () => {
    const props = {
      id: 'wire',
      source: 'a',
      target: 'b',
      sourceX: 280,
      sourceY: 98,
      targetX: 20,
      targetY: 394,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    } as EdgeProps
    const { getByTestId } = render(<CanvasRoutedEdge {...props} />)
    expect(getByTestId('route').getAttribute('d')).toBe(
      'M150 152L150 172L150 246L150 246L150 320L150 340',
    )
  })
  it.each([false, true])(
    'separates fallback lane %s (mutation: omit fallback lane shift)',
    (reverse) => {
      const props = {
        id: 'wire',
        source: reverse ? 'b' : 'a',
        target: reverse ? 'a' : 'b',
        sourceX: 280,
        sourceY: 98,
        targetX: 20,
        targetY: 394,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: { opposed: true },
      } as EdgeProps
      const { getByTestId } = render(<CanvasRoutedEdge {...props} />)
      expect(
        getByTestId('route')
          .getAttribute('d')
          ?.startsWith(reverse ? 'M160 340' : 'M140 152'),
      ).toBe(true)
    },
  )
})
