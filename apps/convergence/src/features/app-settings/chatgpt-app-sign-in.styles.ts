import type { ChatGptSignInTone } from './chatgpt-app-sign-in.pure'

/** The sign-in line's colour per tone (MAR-3470), from TH1's tested roles. */
export const CHATGPT_SIGN_IN_TONE: Record<ChatGptSignInTone, string> = {
  muted: 'text-muted-foreground',
  good: 'text-success-ink',
  warn: 'text-warning-ink',
}
