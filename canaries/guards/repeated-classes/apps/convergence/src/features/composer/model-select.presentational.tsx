// The label's classes a third time, handed to a Select through triggerClassName: a class
// attribute too.
import { Select } from '@/shared/ui/select'

export function ModelSelect() {
  return (
    <Select triggerClassName="text-[11px] uppercase tracking-wide text-muted-foreground" />
  )
}
