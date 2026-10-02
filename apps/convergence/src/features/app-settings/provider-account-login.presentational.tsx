import type { ProviderAccountLoginAttempt } from '@/shared/types/provider-account-login.types'
import {
  Button,
  Card,
  CopyButton,
  Field,
  FieldLabel,
  Input,
  Spinner,
  TextLink,
} from '@convergence/ui'
import { ProviderIcon } from '@/shared/ui/provider-icon.presentational'

export function ProviderAccountLoginProgress({
  attempt,
  code,
  onCodeChange,
  onSubmitCode,
  onCancel,
}: {
  attempt: ProviderAccountLoginAttempt
  code: string
  onCodeChange: (value: string) => void
  onSubmitCode: () => void
  onCancel: () => void
}) {
  const canCancel =
    attempt.active &&
    attempt.state !== 'finishing' &&
    attempt.state !== 'cancelling'
  const providerName = attempt.providerId === 'codex' ? 'OpenAI' : 'Anthropic'
  return (
    <Card
      render={<section />}
      aria-label={`${providerName} sign-in`}
      padding="md"
      className="space-y-3"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <ProviderIcon providerId={attempt.providerId} title="" />
        <span>{providerName} sign-in</span>
        {attempt.active ? <Spinner className="ml-auto text-ink-muted" /> : null}
      </div>
      <p
        role="status"
        aria-live="polite"
        className="text-sm leading-relaxed text-ink-muted"
      >
        {attempt.message}
      </p>
      {attempt.authorizationUrl && attempt.active ? (
        <div className="flex flex-wrap items-center gap-3">
          <TextLink
            external
            href={attempt.authorizationUrl}
            className="text-sm"
          >
            Open sign-in page
          </TextLink>
          <CopyButton
            variant="button"
            text={attempt.authorizationUrl}
            label="Copy sign-in link"
          />
        </div>
      ) : null}
      {attempt.state === 'waiting-code' ? (
        <div className="space-y-2">
          <Field>
            <FieldLabel>Authorization code</FieldLabel>
            <Input
              size="lg"
              type="password"
              value={code}
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste the code from your browser"
              onChange={(event) => onCodeChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && code.trim()) {
                  event.preventDefault()
                  onSubmitCode()
                }
              }}
            />
          </Field>
          <Button
            type="button"
            disabled={!code.trim()}
            onClick={onSubmitCode}
            size="lg"
          >
            Submit code
          </Button>
        </div>
      ) : null}
      {canCancel ? (
        <Button type="button" variant="ghost" onClick={onCancel} size="lg">
          Cancel sign-in
        </Button>
      ) : null}
      {attempt.active ? (
        <p className="text-xs text-ink-muted">
          You can close Settings and return to this sign-in.
        </p>
      ) : null}
    </Card>
  )
}
