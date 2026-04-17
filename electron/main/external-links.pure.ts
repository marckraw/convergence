interface ExternalNavigationInput {
  currentUrl: string
  targetUrl: string
}

function isHttpUrl(value: URL): boolean {
  return value.protocol === 'http:' || value.protocol === 'https:'
}

export function shouldOpenInSystemBrowser({
  currentUrl,
  targetUrl,
}: ExternalNavigationInput): boolean {
  if (!currentUrl) {
    return false
  }

  let target: URL

  try {
    target = new URL(targetUrl)
  } catch {
    return false
  }

  if (!isHttpUrl(target)) {
    return false
  }

  let current: URL

  try {
    current = new URL(currentUrl)
  } catch {
    return true
  }

  if (current.protocol === 'file:') {
    return true
  }

  return current.origin !== target.origin
}
