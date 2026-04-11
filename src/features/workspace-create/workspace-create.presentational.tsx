import type { FC } from 'react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { GitBranch } from 'lucide-react'

interface WorkspaceCreateFormProps {
  branchName: string
  onBranchNameChange: (value: string) => void
  onSubmit: () => void
}

export const WorkspaceCreateForm: FC<WorkspaceCreateFormProps> = ({
  branchName,
  onBranchNameChange,
  onSubmit,
}) => (
  <form
    onSubmit={(e) => {
      e.preventDefault()
      onSubmit()
    }}
    className="flex items-center gap-2"
  >
    <div className="relative flex-1">
      <GitBranch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        value={branchName}
        onChange={(e) => onBranchNameChange(e.target.value)}
        placeholder="Branch name..."
        className="pl-8"
      />
    </div>
    <Button type="submit" size="sm" disabled={!branchName.trim()}>
      Create
    </Button>
  </form>
)
