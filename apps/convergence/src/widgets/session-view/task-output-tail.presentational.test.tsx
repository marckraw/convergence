import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { TaskOutputTail } from './task-output-tail.presentational'
import { TASK_OUTPUT_REFUSAL_WORDS } from './task-output-tail.pure'

const reading = {
  kind: 'output' as const,
  text: 'building\nlinking\n',
  status: 'running' as const,
  truncated: true,
  totalBytes: 99_999,
  readAt: '2026-10-18T10:00:00.000Z',
}

it('offers the read before anything is fetched, and asks once it is pressed — mutation fetch on render turns red', () => {
  const onRead = vi.fn()
  render(<TaskOutputTail view={{ kind: 'idle' }} onRead={onRead} />)
  expect(onRead).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Read output tail' }))
  expect(onRead).toHaveBeenCalledTimes(1)
})

it('disables the button while a read is under way — mutation leave it enabled turns red', () => {
  render(<TaskOutputTail view={{ kind: 'loading' }} onRead={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Reading…' })).toBeDisabled()
})

it('shows the host’s lines in a labelled block, with what they cover and offers to read again', () => {
  render(<TaskOutputTail view={{ kind: 'output', reading }} onRead={vi.fn()} />)
  expect(screen.getByLabelText('Task output tail').textContent).toContain(
    'building\nlinking',
  )
  expect(
    screen.getByText(/The end of the output, up to 64 KiB · running/),
  ).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Read again' })).toBeEnabled()
})

it('says an output with no complete line yet rather than showing an empty box', () => {
  render(
    <TaskOutputTail
      view={{ kind: 'output', reading: { ...reading, text: '' } }}
      onRead={vi.fn()}
    />,
  )
  expect(screen.getByText('No complete line yet')).toBeTruthy()
  expect(screen.queryByLabelText('Task output tail')).toBeNull()
})

it.each(Object.entries(TASK_OUTPUT_REFUSAL_WORDS))(
  'puts a %s refusal in words — mutation show the code or the host’s text turns red',
  (code, words) => {
    render(
      <TaskOutputTail
        view={{
          kind: 'refused',
          code: code as keyof typeof TASK_OUTPUT_REFUSAL_WORDS,
        }}
        onRead={vi.fn()}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe(words)
    expect(screen.getByRole('button', { name: 'Read again' })).toBeEnabled()
  },
)

it('shows a host that could not be reached as a failure with its message', () => {
  render(
    <TaskOutputTail
      view={{ kind: 'failed', message: 'Remote execution host is unreachable' }}
      onRead={vi.fn()}
    />,
  )
  expect(
    screen.getByText(
      'Couldn’t read the output: Remote execution host is unreachable',
    ),
  ).toBeTruthy()
})
