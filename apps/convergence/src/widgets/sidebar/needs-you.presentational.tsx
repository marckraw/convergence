import type { NeedsYouCardModel } from '@/features/needs-you'
import {
  NeedsYouSection,
  type NeedsYouSectionProps,
} from './needs-you-section.presentational'
interface NeedsYouProps extends Omit<NeedsYouSectionProps, 'title' | 'cards'> {
  groups: { title: string; cards: NeedsYouCardModel[] }[]
}
export function NeedsYou({ groups, ...props }: NeedsYouProps) {
  if (groups.length === 0) return null
  return (
    <div className="space-y-3 px-3 pb-3">
      {groups.map((group) => (
        <NeedsYouSection key={group.title} {...group} {...props} />
      ))}
    </div>
  )
}
