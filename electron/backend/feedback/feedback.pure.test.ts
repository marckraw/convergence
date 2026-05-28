import { describe, expect, it } from 'vitest'
import { MAX_DETAIL_LENGTH } from './feedback.constants'
import { isFeedbackPriority, readErrorDetail } from './feedback.pure'

describe('isFeedbackPriority', () => {
  it('accepts supported feedback priorities', () => {
    expect(isFeedbackPriority('low')).toBe(true)
    expect(isFeedbackPriority('medium')).toBe(true)
    expect(isFeedbackPriority('high')).toBe(true)
  })

  it('rejects unknown values', () => {
    expect(isFeedbackPriority('urgent')).toBe(false)
    expect(isFeedbackPriority('')).toBe(false)
    expect(isFeedbackPriority(null)).toBe(false)
  })
})

describe('readErrorDetail', () => {
  it('reads known JSON detail fields', async () => {
    await expect(
      readErrorDetail(new Response(JSON.stringify({ error: 'bad input' }))),
    ).resolves.toEqual({
      message: 'bad input',
      raw: '{"error":"bad input"}',
    })

    await expect(
      readErrorDetail(new Response(JSON.stringify({ message: 'try again' }))),
    ).resolves.toMatchObject({ message: 'try again' })

    await expect(
      readErrorDetail(new Response(JSON.stringify({ detail: 'too short' }))),
    ).resolves.toMatchObject({ message: 'too short' })
  })

  it('joins JSON errors arrays', async () => {
    await expect(
      readErrorDetail(
        new Response(
          JSON.stringify({
            errors: ['first issue', { message: 'second issue' }, {}],
          }),
        ),
      ),
    ).resolves.toEqual({
      message: 'first issue; second issue',
      raw: '{"errors":["first issue",{"message":"second issue"},{}]}',
    })
  })

  it('falls back to compact JSON or raw text', async () => {
    await expect(
      readErrorDetail(
        new Response(JSON.stringify({ code: 'invalid', field: 'title' })),
      ),
    ).resolves.toEqual({
      message: '{"code":"invalid","field":"title"}',
      raw: '{"code":"invalid","field":"title"}',
    })

    await expect(
      readErrorDetail(new Response('Bad Request: missing field')),
    ).resolves.toEqual({
      message: 'Bad Request: missing field',
      raw: 'Bad Request: missing field',
    })
  })

  it('returns empty detail for empty bodies and unreadable responses', async () => {
    await expect(readErrorDetail(new Response('   '))).resolves.toEqual({
      message: '',
      raw: '',
    })

    await expect(
      readErrorDetail({
        text: async () => {
          throw new Error('read failed')
        },
      } as unknown as Response),
    ).resolves.toEqual({ message: '', raw: '' })
  })

  it('truncates long detail messages', async () => {
    const detail = 'x'.repeat(MAX_DETAIL_LENGTH + 1)

    const result = await readErrorDetail(
      new Response(JSON.stringify({ error: detail })),
    )

    expect(result.message).toHaveLength(MAX_DETAIL_LENGTH + 1)
    expect(result.message).toBe(`${'x'.repeat(MAX_DETAIL_LENGTH)}…`)
  })
})
