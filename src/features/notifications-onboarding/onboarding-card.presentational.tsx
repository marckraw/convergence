import type { FC } from 'react'
import { Button } from '@/shared/ui/button'

interface OnboardingCardProps {
  onOpenSettings: () => void
  onDismiss: () => void
}

export const NotificationsOnboardingCard: FC<OnboardingCardProps> = ({
  onOpenSettings,
  onDismiss,
}) => (
  <div
    role="region"
    aria-label="Notifications onboarding"
    className="mx-4 mt-3 flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between"
  >
    <p className="text-foreground">
      Convergence can notify you when agents finish or need input. Try a test
      notification in Settings &rarr; Notifications.
    </p>
    <div className="flex shrink-0 gap-2">
      <Button type="button" size="sm" onClick={onOpenSettings}>
        Open Settings
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
        Don&rsquo;t show again
      </Button>
    </div>
  </div>
)
