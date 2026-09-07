import type { StudioIdentity } from '../../shared/ui'

/** Mock authentication seam; S1 opens no browser and makes no sign-in request. */
export async function signIn(): Promise<StudioIdentity> {
  await new Promise<void>((resolve) => setTimeout(resolve, 500))
  return { name: 'Marcin Krawczyk', initials: 'MK' }
}
