import type { FC, FormEvent } from 'react'
import type { InteractionResponse } from '@/entities/session'
import { Button } from '@/shared/ui/button'

interface UrlRequestFormProps {
  onSubmit: (response: InteractionResponse, displayText: string) => void
}

export const UrlRequestForm: FC<UrlRequestFormProps> = ({ onSubmit }) => (
  <form
    className="mt-4 flex flex-wrap gap-2"
    onSubmit={(event) => {
      event.preventDefault()
      const action = getSubmitAction(event)
      onSubmit(
        {
          kind: 'url',
          action,
        },
        action === 'accept' ? 'Accepted URL request' : 'Declined URL request',
      )
    }}
  >
    <Button size="sm" type="submit" name="action" value="accept">
      Accept
    </Button>
    <Button
      size="sm"
      type="submit"
      name="action"
      value="decline"
      variant="ghost"
    >
      Decline
    </Button>
  </form>
)

function getSubmitAction(
  event: FormEvent<HTMLFormElement>,
): 'accept' | 'decline' {
  const nativeEvent = event.nativeEvent as SubmitEvent
  const submitter = nativeEvent.submitter
  return submitter instanceof HTMLButtonElement && submitter.value === 'decline'
    ? 'decline'
    : 'accept'
}
