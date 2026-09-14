import { AlertCircle, KeyRound, LoaderCircle } from 'lucide-react'
import { describeAccountHandoffRefusal } from '@/entities/provider-account'
import type { AccountHandoffRefusal } from '@/shared/types/session-send.types'
import { Button } from '@/shared/ui/button'

export type ComposerAccountNoticeState =
  | { kind: 'pending' | 'staged' }
  | { kind: 'refused'; refusal: AccountHandoffRefusal }

export function ComposerAccountNotice({
  notice,
  onManageAccounts,
}: {
  notice: ComposerAccountNoticeState
  onManageAccounts?: () => void
}) {
  const refusal = notice.kind === 'refused' ? notice.refusal : null
  const Icon = refusal
    ? AlertCircle
    : notice.kind === 'pending'
      ? LoaderCircle
      : KeyRound

  return (
    <div
      role={refusal ? 'alert' : 'status'}
      data-stage={refusal?.stage}
      className="flex min-w-0 items-start gap-2 text-xs leading-relaxed"
    >
      <Icon
        aria-hidden="true"
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${refusal ? 'text-destructive' : 'text-muted-foreground'}`}
      />
      <div className="min-w-0 space-y-1 break-words text-muted-foreground">
        {refusal ? (
          <>
            <p className="font-medium text-destructive">
              Not sent · {describeAccountHandoffRefusal(refusal.stage)}
            </p>
            <p>{refusal.message}</p>
            {onManageAccounts &&
            (refusal.stage === 'layout' ||
              refusal.stage === 'missing-thread') ? (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs"
                onClick={onManageAccounts}
              >
                Manage accounts
              </Button>
            ) : null}
          </>
        ) : notice.kind === 'pending' ? (
          <p>Switching accounts… Your message has not been accepted yet.</p>
        ) : (
          <p>
            Your next turn will use the selected account. Switching accounts
            restarts idle servers. Running work elsewhere on either account can
            block a switch. Your conversation is preserved.
          </p>
        )}
      </div>
    </div>
  )
}
