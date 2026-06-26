export function deriveCloneFolderName(remoteUrl: string): string {
  const normalized = remoteUrl.trim().replace(/\/+$/, '')
  const lastSegment =
    normalized
      .split(/[:/\\]/)
      .filter(Boolean)
      .at(-1) ?? ''
  return lastSegment.replace(/\.git$/i, '').trim()
}
