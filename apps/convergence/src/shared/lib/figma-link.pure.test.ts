import { describe, expect, it } from 'vitest'
import { containsFigmaLink, issueNeedsFigma } from './figma-link.pure'

describe('MAR-3526 a Figma link makes an issue design-sourced', () => {
  it('finds a link to any figma.com page', () => {
    expect(
      containsFigmaLink(
        '[Open the handoff page](<https://www.figma.com/design/nizm/Convergence-App-UI?node-id=508-362>)',
      ),
    ).toBe(true)
    expect(containsFigmaLink('see http://figma.com/file/abc')).toBe(true)
    expect(containsFigmaLink('HTTPS://EMBED.FIGMA.COM/proto/x')).toBe(true)
  })
  it('a mention, another host, or nothing is not a link', () => {
    expect(containsFigmaLink('designed in figma.com, see the doc')).toBe(false)
    expect(containsFigmaLink('https://notfigma.com.evil/x')).toBe(false)
    expect(containsFigmaLink('https://figma.company.com/x')).toBe(false)
    expect(containsFigmaLink('https://figma.com/')).toBe(false)
    expect(containsFigmaLink(null)).toBe(false)
    expect(containsFigmaLink(undefined)).toBe(false)
  })
  it('either an attachment or the body is enough; unknown is not', () => {
    expect(issueNeedsFigma({ figmaLinked: true })).toBe(true)
    expect(issueNeedsFigma({ figmaInBody: true })).toBe(true)
    expect(issueNeedsFigma({ figmaLinked: false, figmaInBody: null })).toBe(
      false,
    )
    expect(issueNeedsFigma({})).toBe(false)
  })
})
