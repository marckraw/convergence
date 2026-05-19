export function getNullDevicePath(
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === 'win32' ? 'NUL' : '/dev/null'
}
