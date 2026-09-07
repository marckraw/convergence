import { useState } from 'react'
import type { StudioIdentity } from '../../shared/ui'
import { signIn } from './sign-in.api'
import { SignIn } from './sign-in.presentational'

export function SignInContainer({
  onSignedIn,
}: {
  onSignedIn: (identity: StudioIdentity) => void
}): React.JSX.Element {
  const [pending, setPending] = useState(false)
  async function handleContinue(): Promise<void> {
    if (pending) return
    setPending(true)
    onSignedIn(await signIn())
  }
  return (
    <SignIn
      pending={pending}
      onContinue={() => {
        void handleContinue()
      }}
    />
  )
}
