import type { NeedsYouCardModel } from '@/features/needs-you'
import {
  NeedsYouSection,
  type NeedsYouSectionProps,
} from './needs-you-section.presentational'
interface NeedsYouProps extends Omit<
  NeedsYouSectionProps,
  'title' | 'cards' | 'folded'
> {
  groups: { title: string; cards: NeedsYouCardModel[] }[]
  /** Section titles folded shut (MAR-3366 R3); a title, not an index. */
  foldedTitles?: ReadonlySet<string>
}
export function NeedsYou({ groups, foldedTitles, ...props }: NeedsYouProps) {
  if (groups.length === 0) return null
  return (
    <div className="space-y-3 px-3 pb-3">
      {groups.map((group) => (
        <NeedsYouSection
          key={group.title}
          {...group}
          {...props}
          folded={foldedTitles?.has(group.title) ?? false}
        />
      ))}
    </div>
  )
}
