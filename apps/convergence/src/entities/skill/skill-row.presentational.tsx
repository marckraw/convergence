import type { FC } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { Badge } from '@convergence/ui'
import { skillRowDescription } from './skill-list.pure'
import { skillRowStyles as styles } from './skill-row.styles'
import type { SkillCatalogEntry } from './skill.types'

/** `full`: the Add popover's row with its tags. `compact`: the `::skill::` picker's. */
export type SkillRowForm = 'full' | 'compact'

interface SkillRowProps {
  skill: SkillCatalogEntry
  /** Already added to the next message: a check after the name. */
  selected: boolean
  form: SkillRowForm
}

/**
 * One skill as a list draws it (CONV-10): its name, a check once it's added,
 * a warning glyph when the catalog has warnings about it, its description,
 * and that it's disabled. The row's frame (a Button, a ListboxOption) is the
 * list's; this is what sits inside it.
 *
 * The compact form says "(added)" to a screen reader, because its frame is
 * an option whose own state is the active row's; the full form's frame is a
 * pressed toggle, which says it already.
 */
export const SkillRow: FC<SkillRowProps> = ({ skill, selected, form }) => {
  const warned = skill.warnings.length > 0
  const description = skillRowDescription(skill)

  if (form === 'compact') {
    return (
      <>
        <span className={styles.compactLine}>
          <span className={styles.compactName}>{skill.displayName}</span>
          {selected ? (
            <>
              <Check aria-hidden className="size-3.5 shrink-0" />
              <span className="sr-only">(added)</span>
            </>
          ) : null}
          {warned ? (
            <AlertTriangle aria-hidden className={styles.warning} />
          ) : null}
          {!skill.enabled ? (
            <Badge caps className="ml-auto">
              Disabled
            </Badge>
          ) : null}
        </span>
        <span className={styles.compactDetail}>{description}</span>
      </>
    )
  }

  return (
    <span className={styles.full}>
      <span className={styles.fullLine}>
        <span className={styles.fullName}>{skill.displayName}</span>
        {selected ? <Check aria-hidden className="size-3.5" /> : null}
        {warned ? (
          <AlertTriangle aria-hidden className={styles.warning} />
        ) : null}
      </span>
      <span className={styles.fullDetail}>{description}</span>
      <span className={styles.fullTags}>
        <Badge caps>{skill.sourceLabel}</Badge>
        <Badge caps>{skill.providerName}</Badge>
        {!skill.enabled ? <Badge caps>Disabled</Badge> : null}
      </span>
    </span>
  )
}
