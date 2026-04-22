export interface DockBadgeWriter {
  setBadge: (text: string) => void
}

export function formatDockBadgeCount(count: number): string {
  if (count <= 0) return ''
  if (count > 9) return '9+'
  return String(count)
}

export class DockBadgeService {
  private count = 0

  constructor(private readonly writer: DockBadgeWriter) {}

  increment(): void {
    this.count += 1
    this.writer.setBadge(formatDockBadgeCount(this.count))
  }

  clear(): void {
    if (this.count === 0) return
    this.count = 0
    this.writer.setBadge('')
  }

  getCount(): number {
    return this.count
  }
}
