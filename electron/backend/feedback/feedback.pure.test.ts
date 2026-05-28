import { describe, expect, it } from 'vitest'
import { MAX_DETAIL_LENGTH } from './feedback.constants'
import { isFeedbackPriority, parseFeedbackErrorDetail } from './feedback.pure'

describe('feedback pure helpers', () => {
  describe('isFeedbackPriority', () => {
    it('accepts supported priorities', () => {
      expect(isFeedbackPriority('low')).toBe(true)
      expect(isFeedbackPriority('medium')).toBe(true)
      expect(isFeedbackPriority('high')).toBe(true)
    })

    it('rejects unsupported priorities', () => {
      expect(isFeedbackPriority('urgent')).toBe(false)
      expect(isFeedbackPriority('')).toBe(false)
      expect(isFeedbackPriority(null)).toBe(false)
    })
  })

  describe('parseFeedbackErrorDetail', () => {
    it('returns empty detail for blank bodies', () => {
      expect(parseFeedbackErrorDetail('   ')).toEqual({
        message: '',
        raw: '',
      })
    })

    it('uses known JSON error fields', () => {
      expect(
        parseFeedbackErrorDetail(JSON.stringify({ error: 'too short' })),
      ).toEqual({
        message: 'too short',
        raw: '{"error":"too short"}',
      })

      expect(
        parseFeedbackErrorDetail(JSON.stringify({ detail: 'missing token' })),
      ).toEqual({
        message: 'missing token',
        raw: '{"detail":"missing token"}',
      })
    })

    it('joins validation error arrays', () => {
      expect(
        parseFeedbackErrorDetail(
          JSON.stringify({
            errors: ['title missing', { message: 'description missing' }, {}],
          }),
        ),
      ).toEqual({
        message: 'title missing; description missing',
        raw: '{"errors":["title missing",{"message":"description missing"},{}]}',
      })
    })

    it('serializes JSON objects without known error fields', () => {
      expect(
        parseFeedbackErrorDetail(
          JSON.stringify({ code: 'invalid_payload', field: 'priority' }),
        ),
      ).toEqual({
        message: '{"code":"invalid_payload","field":"priority"}',
        raw: '{"code":"invalid_payload","field":"priority"}',
      })
    })

    it('falls back to trimmed text when the body is not JSON', () => {
      expect(parseFeedbackErrorDetail(' Bad Request ')).toEqual({
        message: 'Bad Request',
        raw: 'Bad Request',
      })
    })

    it('truncates long details', () => {
      const detail = 'x'.repeat(MAX_DETAIL_LENGTH + 10)

      expect(parseFeedbackErrorDetail(detail)).toEqual({
        message: `${'x'.repeat(MAX_DETAIL_LENGTH)}…`,
        raw: detail,
      })
    })
  })
})
