import { describe, expect, it } from 'vitest'
import {
  getExternalNavigationAction,
  shouldOpenInSystemBrowser,
} from './external-links.pure'

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

  it.each([
    ['mailto:test@example.com'],
    ['message://%3Cexample-message-id%3E'],
    ['todoist://task?id=123'],
  ])('returns true for external app link %s', (targetUrl) => {
    expect(
      shouldOpenInSystemBrowser({
        currentUrl: 'file:///Applications/Convergence.app/index.html',
        targetUrl,
      }),
    ).toBe(true)
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

describe('getExternalNavigationAction', () => {
  it('denies navigation before the app has finished its initial load', () => {
    expect(
      getExternalNavigationAction({
        currentUrl: '',
        targetUrl: 'https://example.com/docs',
      }),
    ).toBe('deny')
  })

  it('opens cross-origin http links externally', () => {
    expect(
      getExternalNavigationAction({
        currentUrl: 'http://127.0.0.1:5173/',
        targetUrl: 'https://example.com/docs',
      }),
    ).toBe('open-external')
  })

  it('allows same-origin app navigations', () => {
    expect(
      getExternalNavigationAction({
        currentUrl: 'http://127.0.0.1:5173/',
        targetUrl: 'http://127.0.0.1:5173/settings',
      }),
    ).toBe('allow')
  })

  it.each([
    ['mailto:test@example.com'],
    ['message://%3Cexample-message-id%3E'],
    ['todoist://task?id=123'],
  ])('opens external app link %s externally', (targetUrl) => {
    expect(
      getExternalNavigationAction({
        currentUrl: 'http://127.0.0.1:5173/',
        targetUrl,
      }),
    ).toBe('open-external')
  })

  it.each([
    ['file:///tmp/evil.html'],
    ['javascript:alert(1)'],
    ['data:text/html,<h1>unsafe</h1>'],
    ['blob:https://example.com/id'],
    ['devtools://devtools/bundled/inspector.html'],
    ['not a url'],
  ])('denies unsafe or malformed target %s', (targetUrl) => {
    expect(
      getExternalNavigationAction({
        currentUrl: 'http://127.0.0.1:5173/',
        targetUrl,
      }),
    ).toBe('deny')
  })
})
