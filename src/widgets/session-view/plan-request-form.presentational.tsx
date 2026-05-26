import type { FC, FormEvent } from 'react'
import type { InteractionResponse } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'

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
        const decision = getSubmitDecision(event)

        if (decision === 'reject') {
          onSubmit(
            {
              kind: 'plan',
              decision: 'reject',
              message: message || undefined,
            },
            message ? `Rejected plan\n\n${message}` : 'Rejected plan',
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
        aria-label="Plan rejection instructions"
        className="min-h-20 resize-y"
        name="message"
        placeholder="Optional rejection notes or requested changes"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" type="submit" name="decision" value="approve">
          Approve plan
        </Button>
        <Button
          size="sm"
          type="submit"
          name="decision"
          value="reject"
          variant="ghost"
        >
          Reject plan
        </Button>
      </div>
    </form>
  )
}

function getSubmitDecision(event: FormEvent<HTMLFormElement>): string {
  const nativeEvent = event.nativeEvent as SubmitEvent
  const submitter = nativeEvent.submitter
  return submitter instanceof HTMLButtonElement ? submitter.value : 'approve'
}
