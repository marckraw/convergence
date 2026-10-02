import { describe, expect, it } from 'vitest'
import {
  agentAttributionLabel,
  approvalCardTitle,
  inputCardTitle,
  submitterValue,
} from './request-card.pure'

describe('approvalCardTitle', () => {
  it('names the ask, then how it was answered', () => {
    expect(approvalCardTitle(null)).toBe('Approval needed')
    expect(approvalCardTitle('approved')).toBe('Approved')
    expect(approvalCardTitle('denied')).toBe('Denied')
  })
})

describe('inputCardTitle', () => {
  it('names what the request asks for', () => {
    expect(inputCardTitle('plan')).toBe('Plan review needed')
    expect(inputCardTitle('form')).toBe('Form input needed')
    expect(inputCardTitle('url')).toBe('URL confirmation needed')
    expect(inputCardTitle('choice')).toBe('Input needed')
    expect(inputCardTitle(undefined)).toBe('Input needed')
  })
})

describe('submitterValue', () => {
  it("reads the submitting button's value, or null when none submitted it", () => {
    expect(submitterValue({ submitter: { value: 'decline' } })).toBe('decline')
    expect(submitterValue({ submitter: null })).toBeNull()
    expect(submitterValue({})).toBeNull()
    expect(submitterValue({ submitter: { value: 3 } })).toBeNull()
  })
})

describe('agentAttributionLabel', () => {
  it('names the subagent, or says only that one made it', () => {
    expect(
      agentAttributionLabel({
        description: 'Inspect fixture',
        agentType: 'Explore',
      }),
    ).toBe('↳ Inspect fixture (Explore)')
    expect(
      agentAttributionLabel({ description: 'Look', agentType: null }),
    ).toBe('↳ Look (unknown)')
    expect(agentAttributionLabel({ description: '  ' })).toBe('↳ subagent')
    expect(agentAttributionLabel(undefined)).toBe('↳ subagent')
  })
})
