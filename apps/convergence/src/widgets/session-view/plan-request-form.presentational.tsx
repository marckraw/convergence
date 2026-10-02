import type { FC } from 'react'
import type { InteractionResponse } from '@/entities/session'
import { Button, Textarea } from '@convergence/ui'
import { submitterValue } from './request-card.pure'

interface PlanRequestFormProps {
  onSubmit: (response: InteractionResponse, displayText: string) => void
}

export const PlanRequestForm: FC<PlanRequestFormProps> = ({ onSubmit }) => {
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        const form = event.currentTarget
        const formData = new FormData(form)
        const message = String(formData.get('message') ?? '').trim()
        const decision = submitterValue(event.nativeEvent) ?? 'approve'

        if (decision === 'reject') {
          onSubmit(
            {
              kind: 'plan',
              decision: 'reject',
              message: message || undefined,
            },
            message ? `Denied plan\n\n${message}` : 'Denied plan',
          )
          return
        }

        onSubmit(
          {
            kind: 'plan',
            decision: 'approve',
          },
          'Approved plan',
        )
      }}
    >
      <Textarea
        aria-label="Why you deny the plan"
        className="min-h-20 resize-y"
        name="message"
        placeholder="Optional: why, or the changes you want"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approve">
          Approve plan
        </Button>
        {/* R10: a plan review is a permission, refused with Deny. */}
        <Button type="submit" name="decision" value="reject" variant="ghost">
          Deny plan
        </Button>
      </div>
    </form>
  )
}
