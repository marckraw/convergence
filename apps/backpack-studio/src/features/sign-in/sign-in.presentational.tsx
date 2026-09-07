import { Button, StoryPanel } from '../../shared/ui'

interface SignInProps {
  pending: boolean
  onContinue: () => void
}

export function SignIn({
  pending,
  onContinue,
}: SignInProps): React.JSX.Element {
  return (
    <main className="studio-onboarding">
      <StoryPanel />
      <section className="studio-panel" aria-labelledby="sign-in-title">
        <h1 id="sign-in-title">Your work starts here.</h1>
        <p className="studio-intro">
          Sign in with your EF work account. Your assistant and GCS tools will
          be ready.
        </p>
        <Button
          variant="filled"
          size="regular"
          onClick={onContinue}
          disabled={pending}
          aria-busy={pending}
        >
          Continue with Microsoft
        </Button>
        <div className="studio-small">
          <p>Sign-in opens securely in your browser.</p>
          <p>Return here when it finishes.</p>
        </div>
        <button
          type="button"
          className="studio-small studio-link"
          title="Access requests are not available in this design build"
          aria-disabled="true"
        >
          Need access? Contact your GCS team.
        </button>
      </section>
    </main>
  )
}
