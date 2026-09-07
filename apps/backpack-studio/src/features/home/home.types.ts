import type { ConnectionReading, ConversationSummary } from '../../shared/api'
import type { StudioIdentity, RequestComposerProps } from '../../shared/ui'
export interface HomeNavProps {
  identity: StudioIdentity
  connection: ConnectionReading
  conversations: ConversationSummary[]
  selectedId?: string | null
  onNew(): void
  onSelect(id: string): void
}
export interface HomeProps extends HomeNavProps {
  composer: RequestComposerProps
}
