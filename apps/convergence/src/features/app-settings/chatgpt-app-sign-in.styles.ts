import { toneInk } from '@convergence/ui'
import type { ChatGptSignInTone } from './chatgpt-app-sign-in.pure'

/** The sign-in line's colour per tone (MAR-3470): the kit's tone inks (R1). */
export const CHATGPT_SIGN_IN_TONE: Record<ChatGptSignInTone, string> = {
  muted: toneInk.neutral,
  good: toneInk.success,
  warn: toneInk.warning,
}
