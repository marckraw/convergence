interface ExternalNavigationInput {
  currentUrl: string
  targetUrl: string
}

export type ExternalNavigationAction = 'allow' | 'open-external' | 'deny'

function isHttpUrl(value: URL): boolean {
  return value.protocol === 'http:' || value.protocol === 'https:'
}

const UNSAFE_EXTERNAL_PROTOCOLS = new Set([
  'about:',
  'blob:',
  'data:',
  'devtools:',
  'file:',
  'javascript:',
  'view-source:',
])

function isAllowedExternalProtocol(value: URL): boolean {
  return !UNSAFE_EXTERNAL_PROTOCOLS.has(value.protocol)
}

export function getExternalNavigationAction({
  currentUrl,
  targetUrl,
}: ExternalNavigationInput): ExternalNavigationAction {
  if (!currentUrl) {
    return 'deny'
  }

  let target: URL

  try {
    target = new URL(targetUrl)
  } catch {
    return 'deny'
  }

  if (!isAllowedExternalProtocol(target)) {
    return 'deny'
  }

  if (!isHttpUrl(target)) {
    return 'open-external'
  }

  let current: URL

  try {
    current = new URL(currentUrl)
  } catch {
    return 'open-external'
  }

  if (current.protocol === 'file:') {
    return 'open-external'
  }

  return current.origin === target.origin ? 'allow' : 'open-external'
}

export function shouldOpenInSystemBrowser(
  input: ExternalNavigationInput,
): boolean {
  return getExternalNavigationAction(input) === 'open-external'
}
