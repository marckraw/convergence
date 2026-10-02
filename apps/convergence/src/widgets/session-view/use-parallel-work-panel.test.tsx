import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useParallelWorkPanel } from './use-parallel-work-panel'

vi.mock('./use-parallel-work', () => ({
  useParallelWork: () => ({
    rows: [],
    error: null,
    loading: false,
    hasRecord: true,
    retry: vi.fn(),
  }),
}))

const buttons: HTMLButtonElement[] = []
const button = (name: string) => {
  const element = document.createElement('button')
  element.textContent = name
  document.body.append(element)
  buttons.push(element)
  return element
}

afterEach(() => {
  for (const element of buttons.splice(0)) element.remove()
})

const render = (sessionId: string | null = 's1') => {
  const viewTrigger = { current: button('View') }
  const hook = renderHook(({ id }) => useParallelWorkPanel(id, viewTrigger), {
    initialProps: { id: sessionId },
  })
  return { ...hook, viewTrigger }
}

it('a row chosen in the transcript opens the panel on it, and the close gives focus back to what was focused — mutation drop the invoker read turns red', () => {
  const { result } = render()
  const row = button('Row')
  row.focus()
  act(() => result.current.select('run-1'))
  expect(result.current.open).toBe(true)
  expect(result.current.selectedIdIn('s1')).toBe('run-1')
  button('Elsewhere').focus()
  act(() => result.current.close())
  expect(result.current.open).toBe(false)
  expect(document.activeElement).toBe(row)
})

it("a choice belongs to the session it was made in — another session's panel shows no row", () => {
  const { result } = render('s1')
  act(() => result.current.select('run-1'))
  expect(result.current.selectedIdIn('s2')).toBeNull()
})

it("opened from View, the close hands focus back to View, not to the row's button — mutation drop the invoker write turns red", () => {
  const { result, viewTrigger } = render()
  result.current.button.current = button('Parallel work')
  act(() => result.current.openFromView())
  expect(result.current.open).toBe(true)
  act(() => result.current.close())
  expect(document.activeElement).toBe(viewTrigger.current)
})

it("the row's button toggles the panel and gets focus back when it closes it", () => {
  const { result } = render()
  const rowButton = button('Parallel work')
  result.current.button.current = rowButton
  act(() => result.current.toggle())
  expect(result.current.open).toBe(true)
  act(() => result.current.toggle())
  expect(result.current.open).toBe(false)
  expect(document.activeElement).toBe(rowButton)
})

it('each jump to the same row is a new navigation, so the transcript scrolls again', () => {
  const { result } = render()
  act(() => result.current.navigate('spawn'))
  const first = result.current.navigation
  act(() => result.current.navigate('spawn'))
  expect(result.current.navigation).toEqual({
    id: 'spawn',
    nonce: (first?.nonce ?? 0) + 1,
  })
})
