import { describe, expect, it } from 'vitest'
import { shouldOpenInSystemBrowser } from './external-links.pure'

describe('shouldOpenInSystemBrowser', () => {
  it('returns false before the app has finished its initial load', () => {
    expect(
      shouldOpenInSystemBrowser({
        currentUrl: '',
        targetUrl: 'https://example.com/docs',
      }),
    ).toBe(false)
  })

  it('returns true for http links from the packaged app renderer', () => {
    expect(
      shouldOpenInSystemBrowser({
        currentUrl: 'file:///Applications/Convergence.app/index.html',
        targetUrl: 'https://example.com/docs',
      }),
    ).toBe(true)
  })

  it('returns true for cross-origin links from the dev renderer', () => {
    expect(
      shouldOpenInSystemBrowser({
        currentUrl: 'http://127.0.0.1:5173/',
        targetUrl: 'https://example.com/docs',
      }),
    ).toBe(true)
  })

  it('returns false for same-origin links', () => {
    expect(
      shouldOpenInSystemBrowser({
        currentUrl: 'http://127.0.0.1:5173/',
        targetUrl: 'http://127.0.0.1:5173/settings',
      }),
    ).toBe(false)
  })

  it('returns false for non-http protocols', () => {
    expect(
      shouldOpenInSystemBrowser({
        currentUrl: 'file:///Applications/Convergence.app/index.html',
        targetUrl: 'mailto:test@example.com',
      }),
    ).toBe(false)
  })

  it('returns false for malformed URLs', () => {
    expect(
      shouldOpenInSystemBrowser({
        currentUrl: 'http://127.0.0.1:5173/',
        targetUrl: 'not a url',
      }),
    ).toBe(false)
  })
})
