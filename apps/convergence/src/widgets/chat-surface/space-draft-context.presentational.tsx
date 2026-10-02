import type { FC } from 'react'
import { CheckSquare } from 'lucide-react'
import {
  Card,
  Checkbox,
  ChoiceField,
  CodeBlock,
  SectionLabel,
} from '@convergence/ui'
import type { SpaceSource } from '@/entities/space'
import {
  withSpaceContextSource,
  type SpaceContextSelection,
} from './space-context.pure'

export interface SpaceDraftContextProps {
  /** What the new chat takes from its Space. */
  selection: SpaceContextSelection
  /** The Space's sources, each one a choice. */
  sources: readonly Pick<SpaceSource, 'id' | 'filename'>[]
  /** The context block the chosen pieces make, or null when none is chosen. */
  preview: string | null
  onChange: (selection: SpaceContextSelection) => void
}

/**
 * What a chat started in a Space takes with it (CONV-30): the brief, the
 * memory and any of its sources, each a choice, and the block they make,
 * shown as it will be sent. Props in, markup out; the draft keeps the
 * selection.
 */
export const SpaceDraftContext: FC<SpaceDraftContextProps> = ({
  selection,
  sources,
  preview,
  onChange,
}) => (
  <Card className="mb-3 w-full max-w-conversation">
    <SectionLabel as="h2" className="mb-3 flex items-center gap-2">
      <CheckSquare aria-hidden className="size-3.5" />
      <span>Context for this chat</span>
    </SectionLabel>
    <div className="space-y-2 text-sm">
      <ChoiceField label="Space brief">
        <Checkbox
          checked={selection.includeBrief}
          onCheckedChange={(checked) =>
            onChange({ ...selection, includeBrief: checked })
          }
        />
      </ChoiceField>
      <ChoiceField label="Space memory/instructions">
        <Checkbox
          checked={selection.includeMemory}
          onCheckedChange={(checked) =>
            onChange({ ...selection, includeMemory: checked })
          }
        />
      </ChoiceField>
      {sources.length > 0 ? (
        <div className="space-y-1 border-t border-line-soft pt-2">
          <div className="text-xs text-ink-muted">Selected sources</div>
          {sources.map((source) => (
            <ChoiceField
              key={source.id}
              label={<span className="block truncate">{source.filename}</span>}
            >
              <Checkbox
                checked={selection.selectedSourceIds.includes(source.id)}
                onCheckedChange={(checked) =>
                  onChange(
                    withSpaceContextSource(selection, source.id, checked),
                  )
                }
              />
            </ChoiceField>
          ))}
        </div>
      ) : null}
    </div>
    <CodeBlock
      label="Space context preview"
      maxHeight="sm"
      wrap
      className="mt-3"
    >
      {preview ?? 'No Space context selected.'}
    </CodeBlock>
  </Card>
)
