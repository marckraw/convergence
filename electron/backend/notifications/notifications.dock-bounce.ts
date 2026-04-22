export type DockBounceKind = 'informational' | 'critical'

export interface DockBounceTarget {
  bounce: (kind: DockBounceKind) => number | undefined
  cancelBounce: (id: number) => void
}

export class DockBounceService {
  private criticalBounceId: number | null = null

  constructor(private readonly target: DockBounceTarget) {}

  bounceInformational(): void {
    this.target.bounce('informational')
  }

  // Critical bounces persist until cancelled, so we hold the latest id and
  // cancel it on the next focus event. Stacking criticals overwrite — older
  // ones implicitly resolve when the dock cancels them via focus.
  bounceCritical(): void {
    const id = this.target.bounce('critical')
    if (typeof id === 'number') {
      this.criticalBounceId = id
    }
  }

  cancelOnFocus(): void {
    if (this.criticalBounceId === null) return
    this.target.cancelBounce(this.criticalBounceId)
    this.criticalBounceId = null
  }
}
