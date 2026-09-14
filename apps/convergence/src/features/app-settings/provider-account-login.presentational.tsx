import { ExternalLink, Loader2 } from 'lucide-react'
import type { ProviderAccountLoginAttempt } from '@/shared/types/provider-account-login.types'
import { Button } from '@/shared/ui/button'
import { CopyButton } from '@/shared/ui/copy-button'
import { Input } from '@/shared/ui/input'
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
    <section
      aria-label={`${providerName} sign-in`}
      className="space-y-3 rounded-xl border border-border bg-muted/30 p-4"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <ProviderIcon providerId={attempt.providerId} title="" />
        <span>{providerName} sign-in</span>
        {attempt.active ? (
          <Loader2
            aria-hidden
            className="ml-auto h-4 w-4 animate-spin text-muted-foreground"
          />
        ) : null}
      </div>
      <p
        role="status"
        aria-live="polite"
        className="text-sm leading-relaxed text-muted-foreground"
      >
        {attempt.message}
      </p>
      {attempt.authorizationUrl && attempt.active ? (
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={attempt.authorizationUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-10 items-center gap-2 text-sm underline underline-offset-4"
          >
            <ExternalLink aria-hidden className="h-4 w-4" />
            Open sign-in page
          </a>
          <CopyButton
            variant="button"
            text={attempt.authorizationUrl}
            label="Copy sign-in link"
          />
        </div>
      ) : null}
      {attempt.state === 'waiting-code' ? (
        <div className="space-y-2">
          <label
            htmlFor="provider-authorization-code"
            className="text-sm font-medium"
          >
            Authorization code
          </label>
          <Input
            id="provider-authorization-code"
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
          <Button type="button" disabled={!code.trim()} onClick={onSubmitCode}>
            Submit code
          </Button>
        </div>
      ) : null}
      {canCancel ? (
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel sign-in
        </Button>
      ) : null}
      {attempt.active ? (
        <p className="text-xs text-muted-foreground">
          You can close Settings and return to this sign-in.
        </p>
      ) : null}
    </section>
  )
}
