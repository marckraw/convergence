export interface StartupFailureDialog {
  title: string
  body: string
}

export function formatStartupFailure(err: unknown): StartupFailureDialog {
  const title = 'Convergence failed to start'
  if (err instanceof Error) {
    return { title, body: err.stack ?? err.message }
  }
  return { title, body: String(err) }
}
