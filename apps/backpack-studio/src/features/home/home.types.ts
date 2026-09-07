import type { ConnectionReading } from '../../shared/api'
import type { StudioIdentity } from '../../shared/ui'

export interface HomeProps {
  identity: StudioIdentity
  connection: ConnectionReading
}
