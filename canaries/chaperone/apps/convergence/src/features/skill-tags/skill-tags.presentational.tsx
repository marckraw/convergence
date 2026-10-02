// canary: use-section-label, use-badge-caps, app-parts-have-stories
// A skill's tags from before the kit had the looks: an eyebrow typed by hand (uppercase with its
// own tracking), and badges put in capitals by className, one of them after a glyph handed in a
// prop. The badge in Badge's own caps and an uppercase word with no tracking are not reported.
import { Badge } from '@convergence/ui'
import { CheckCircle2 } from 'lucide-react'

const heading = 'text-3xs font-medium uppercase tracking-wide text-ink-muted'

type SkillTagsProps = { source: string }

export function SkillTags({ source }: SkillTagsProps) {
  return (
    <div>
      <p className={heading}>Tags</p>
      <Badge className="uppercase">{source}</Badge>
      <Badge tone="success" icon={<CheckCircle2 />} className="ml-1 uppercase">
        Enabled
      </Badge>
      <Badge caps>Project</Badge>
      <span className="text-3xs uppercase">draft</span>
    </div>
  )
}
