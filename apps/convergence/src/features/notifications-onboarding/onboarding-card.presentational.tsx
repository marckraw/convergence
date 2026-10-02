import type { FC } from 'react'
import { Button, Card } from '@convergence/ui'

interface OnboardingCardProps {
  onOpenSettings: () => void
  onDismiss: () => void
}

export const NotificationsOnboardingCard: FC<OnboardingCardProps> = ({
  onOpenSettings,
  onDismiss,
}) => (
  <Card
    role="region"
    aria-label="Notifications onboarding"
    surface="raised"
    className="mx-4 mt-3 flex flex-col gap-2 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between"
  >
    <p>
      Convergence can notify you when agents finish or need input. Try a test
      notification in Settings &rarr; Notifications.
    </p>
    <div className="flex shrink-0 gap-2">
      <Button type="button" onClick={onOpenSettings}>
        Open Settings
      </Button>
      <Button type="button" variant="ghost" onClick={onDismiss}>
        Don&rsquo;t show again
      </Button>
    </div>
  </Card>
)
