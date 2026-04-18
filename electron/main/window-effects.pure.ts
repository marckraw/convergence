import type { WindowAppearanceOptions } from './window-effects.shared.pure'
import { getDefaultOpaqueWindowOptions } from './window-effects.shared.pure'
import { getDarwinWindowOptions } from './window-effects.darwin.pure'

interface WindowAppearanceInput {
  platform: NodeJS.Platform
  prefersReducedTransparency: boolean
}

export function getWindowAppearanceOptions({
  platform,
  prefersReducedTransparency,
}: WindowAppearanceInput): WindowAppearanceOptions {
  if (platform === 'darwin') {
    return getDarwinWindowOptions({ prefersReducedTransparency })
  }

  return getDefaultOpaqueWindowOptions()
}
