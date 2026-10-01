import type { FC } from 'react'
import type { InteractionResponse } from '@/entities/session'
import { Button } from '@convergence/ui'
import { submitterValue } from './request-card.pure'

interface UrlRequestFormProps {
  onSubmit: (response: InteractionResponse, displayText: string) => void
}

export const UrlRequestForm: FC<UrlRequestFormProps> = ({ onSubmit }) => (
  <form
    className="mt-4 flex flex-wrap gap-2"
    onSubmit={(event) => {
      event.preventDefault()
      const action =
        submitterValue(event.nativeEvent) === 'decline' ? 'decline' : 'accept'
      onSubmit(
        {
          kind: 'url',
          action,
        },
        action === 'accept' ? 'Accepted URL request' : 'Declined URL request',
      )
    }}
  >
    <Button type="submit" name="action" value="accept">
      Accept
    </Button>
    <Button type="submit" name="action" value="decline" variant="ghost">
      Decline
    </Button>
  </form>
)
