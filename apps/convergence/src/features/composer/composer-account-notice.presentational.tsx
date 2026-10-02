import { AlertCircle, KeyRound, LoaderCircle } from 'lucide-react'
import { describeAccountHandoffRefusal } from '@/entities/provider-account'
import type { AccountHandoffRefusal } from '@/shared/types/session-send.types'
import { Button, MetaLine, Notice } from '@convergence/ui'

export type ComposerAccountNoticeState =
  | { kind: 'pending' | 'staged' }
  | { kind: 'refused'; refusal: AccountHandoffRefusal }

/**
 * What the composer says about the account the next turn uses (CONV-7): a
 * Notice in its tone. A refused switch is a failure, danger and an alert; a
 * switch under way and one staged for the next turn are info, a polite status.
 */
export function ComposerAccountNotice({
  notice,
  onManageAccounts,
}: {
  notice: ComposerAccountNoticeState
  onManageAccounts?: () => void
}) {
  if (notice.kind === 'refused') {
    const { refusal } = notice
    return (
      <Notice
        tone="danger"
        icon={<AlertCircle />}
        title={
          // Its facts on a MetaLine (CONV-23).
          <MetaLine wrap>
            Not sent
            {describeAccountHandoffRefusal(refusal.stage)}
          </MetaLine>
        }
        data-stage={refusal.stage}
        actions={
          onManageAccounts &&
          (refusal.stage === 'layout' || refusal.stage === 'missing-thread') ? (
            <Button type="button" variant="link" onClick={onManageAccounts}>
              Manage accounts
            </Button>
          ) : undefined
        }
        className="text-xs"
      >
        {refusal.message}
      </Notice>
    )
  }
  return notice.kind === 'pending' ? (
    <Notice
      tone="info"
      icon={<LoaderCircle />}
      title="Switching accounts…"
      className="text-xs"
    >
      Your message has not been accepted yet.
    </Notice>
  ) : (
    <Notice
      tone="info"
      icon={<KeyRound />}
      title="Your next turn will use the selected account."
      className="text-xs"
    >
      Switching accounts restarts idle servers. Running work elsewhere on either
      account can block a switch. Your conversation is preserved.
    </Notice>
  )
}
