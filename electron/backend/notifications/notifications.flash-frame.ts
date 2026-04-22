export interface FlashFrameTarget {
  flashFrame: (flag: boolean) => void
}

export class FlashFrameService {
  private active = false

  constructor(private readonly target: FlashFrameTarget) {}

  flash(): void {
    this.target.flashFrame(true)
    this.active = true
  }

  clearOnFocus(): void {
    if (!this.active) return
    this.target.flashFrame(false)
    this.active = false
  }
}
