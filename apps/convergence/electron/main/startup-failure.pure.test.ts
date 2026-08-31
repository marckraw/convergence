import { describe, expect, it } from 'vitest'
import { formatStartupFailure } from './startup-failure.pure'

describe('formatStartupFailure', () => {
  it('uses stack when available', () => {
    const err = new Error('db open failed')
    err.stack = 'Error: db open failed\n    at open'
    const { title, body } = formatStartupFailure(err)
    expect(title).toBe('Convergence failed to start')
    expect(body).toBe('Error: db open failed\n    at open')
  })

  it('uses only the message when stack is missing', () => {
    const err = new Error('no stack here')
    err.stack = undefined
    const { body } = formatStartupFailure(err)
    expect(body).toBe('no stack here')
  })

  it('stringifies non-Error rejections', () => {
    const { body } = formatStartupFailure('boom')
    expect(body).toBe('boom')
  })

  it('handles undefined rejection', () => {
    const { body } = formatStartupFailure(undefined)
    expect(body).toBe('undefined')
  })
})
