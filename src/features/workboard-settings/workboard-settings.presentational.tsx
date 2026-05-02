import type { FormEvent } from 'react'
import { Database, GitBranch, KeyRound, Route } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import type { Project } from '@/entities/project'
import type {
  WorkboardProjectMappingRecord,
  WorkboardTrackerSourceRecord,
  WorkboardTrackerType,
} from '@/entities/workboard'

export interface WorkboardSourceForm {
  type: WorkboardTrackerType
  name: string
  token: string
  teamKey: string
  projectName: string
  labels: string
  first: string
  siteUrl: string
  email: string
  apiToken: string
  jql: string
  maxResults: string
}

export interface WorkboardMappingForm {
  sourceId: string
  projectId: string
  name: string
  priority: string
  teamKey: string
  projectName: string
  projectKey: string
  labels: string
  components: string
  workflowPolicy: string
  sandboxMode: string
  branchPrefix: string
  provider: string
  model: string
  effort: string
  maxIterations: string
}

export interface WorkboardSettingsProps {
  sources: WorkboardTrackerSourceRecord[]
  mappings: WorkboardProjectMappingRecord[]
  projects: Project[]
  sourceForm: WorkboardSourceForm
  mappingForm: WorkboardMappingForm
  saving: boolean
  setupError: string | null
  onSourceFormChange: (patch: Partial<WorkboardSourceForm>) => void
  onMappingFormChange: (patch: Partial<WorkboardMappingForm>) => void
  onSaveSource: () => void
  onSaveMapping: () => void
}

function sourceTypeLabel(type: WorkboardTrackerType): string {
  return type === 'linear' ? 'Linear' : 'Jira'
}

function sourceName(
  sources: WorkboardTrackerSourceRecord[],
  sourceId: string,
): string {
  return sources.find((source) => source.id === sourceId)?.name ?? sourceId
}

function projectName(projects: Project[], projectId: string): string {
  return projects.find((project) => project.id === projectId)?.name ?? projectId
}

export function WorkboardSettingsView({
  sources,
  mappings,
  projects,
  sourceForm,
  mappingForm,
  saving,
  setupError,
  onSourceFormChange,
  onMappingFormChange,
  onSaveSource,
  onSaveMapping,
}: WorkboardSettingsProps) {
  const handleSourceSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSaveSource()
  }
  const handleMappingSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSaveMapping()
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Tracker sources and routing</h2>
        {setupError ? (
          <p className="mt-1 text-xs leading-relaxed text-destructive">
            {setupError}
          </p>
        ) : null}
      </div>

      <section className="rounded-md border border-border bg-card/68 p-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold">Tracker sources</h3>
          <Database className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          {sources.map((source) => (
            <div
              key={source.id}
              className="rounded border border-border/70 bg-background/58 px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium">{source.name}</p>
                <span className="text-[11px] text-muted-foreground">
                  {sourceTypeLabel(source.type)}
                </span>
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {source.enabled ? 'Enabled' : 'Disabled'} ·{' '}
                {source.lastSyncAt ?? 'Never synced'}
              </p>
            </div>
          ))}
          {sources.length === 0 ? (
            <div className="rounded border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground">
              No sources saved.
            </div>
          ) : null}
        </div>
      </section>

      <form
        className="space-y-3 rounded-md border border-border bg-card/68 p-3"
        onSubmit={handleSourceSubmit}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold">Add source</h3>
          <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>Type</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
              value={sourceForm.type}
              onChange={(event) =>
                onSourceFormChange({
                  type: event.target.value as WorkboardTrackerType,
                })
              }
            >
              <option value="linear">Linear</option>
              <option value="jira">Jira</option>
            </select>
          </label>
          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>Name</span>
            <Input
              value={sourceForm.name}
              onChange={(event) =>
                onSourceFormChange({ name: event.target.value })
              }
              placeholder="Linear personal"
            />
          </label>
        </div>

        {sourceForm.type === 'linear' ? (
          <>
            <label className="space-y-1 text-[11px] text-muted-foreground">
              <span>Linear API token</span>
              <Input
                type="password"
                value={sourceForm.token}
                onChange={(event) =>
                  onSourceFormChange({ token: event.target.value })
                }
                placeholder="lin_api_..."
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-[11px] text-muted-foreground">
                <span>Team key</span>
                <Input
                  value={sourceForm.teamKey}
                  onChange={(event) =>
                    onSourceFormChange({ teamKey: event.target.value })
                  }
                  placeholder="CONV"
                />
              </label>
              <label className="space-y-1 text-[11px] text-muted-foreground">
                <span>Project</span>
                <Input
                  value={sourceForm.projectName}
                  onChange={(event) =>
                    onSourceFormChange({ projectName: event.target.value })
                  }
                  placeholder="optional"
                />
              </label>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-2">
              <label className="space-y-1 text-[11px] text-muted-foreground">
                <span>Labels</span>
                <Input
                  value={sourceForm.labels}
                  onChange={(event) =>
                    onSourceFormChange({ labels: event.target.value })
                  }
                  placeholder="convergence-loop"
                />
              </label>
              <label className="space-y-1 text-[11px] text-muted-foreground">
                <span>Limit</span>
                <Input
                  value={sourceForm.first}
                  onChange={(event) =>
                    onSourceFormChange({ first: event.target.value })
                  }
                />
              </label>
            </div>
          </>
        ) : (
          <>
            <label className="space-y-1 text-[11px] text-muted-foreground">
              <span>Jira site URL</span>
              <Input
                value={sourceForm.siteUrl}
                onChange={(event) =>
                  onSourceFormChange({ siteUrl: event.target.value })
                }
                placeholder="https://company.atlassian.net"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-[11px] text-muted-foreground">
                <span>Email</span>
                <Input
                  value={sourceForm.email}
                  onChange={(event) =>
                    onSourceFormChange({ email: event.target.value })
                  }
                />
              </label>
              <label className="space-y-1 text-[11px] text-muted-foreground">
                <span>API token</span>
                <Input
                  type="password"
                  value={sourceForm.apiToken}
                  onChange={(event) =>
                    onSourceFormChange({ apiToken: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-2">
              <label className="space-y-1 text-[11px] text-muted-foreground">
                <span>JQL</span>
                <Input
                  value={sourceForm.jql}
                  onChange={(event) =>
                    onSourceFormChange({ jql: event.target.value })
                  }
                />
              </label>
              <label className="space-y-1 text-[11px] text-muted-foreground">
                <span>Limit</span>
                <Input
                  value={sourceForm.maxResults}
                  onChange={(event) =>
                    onSourceFormChange({ maxResults: event.target.value })
                  }
                />
              </label>
            </div>
          </>
        )}

        <Button type="submit" size="sm" className="w-full" disabled={saving}>
          Save source
        </Button>
      </form>

      <section className="rounded-md border border-border bg-card/68 p-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold">Project mappings</h3>
          <Route className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          {mappings.map((mapping) => (
            <div
              key={mapping.id}
              className="rounded border border-border/70 bg-background/58 px-2.5 py-2"
            >
              <p className="truncate text-xs font-medium">{mapping.name}</p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {sourceName(sources, mapping.sourceId)} ·{' '}
                {projectName(projects, mapping.projectId)}
              </p>
            </div>
          ))}
          {mappings.length === 0 ? (
            <div className="rounded border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground">
              No mappings saved.
            </div>
          ) : null}
        </div>
      </section>

      <form
        className="space-y-3 rounded-md border border-border bg-card/68 p-3"
        onSubmit={handleMappingSubmit}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold">Add mapping</h3>
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          <span>Name</span>
          <Input
            value={mappingForm.name}
            onChange={(event) =>
              onMappingFormChange({ name: event.target.value })
            }
            placeholder="Linear CONV -> convergence"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>Source</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
              value={mappingForm.sourceId}
              onChange={(event) =>
                onMappingFormChange({ sourceId: event.target.value })
              }
            >
              <option value="">Select</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>Project</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
              value={mappingForm.projectId}
              onChange={(event) =>
                onMappingFormChange({ projectId: event.target.value })
              }
            >
              <option value="">Select</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>Team key</span>
            <Input
              value={mappingForm.teamKey}
              onChange={(event) =>
                onMappingFormChange({ teamKey: event.target.value })
              }
              placeholder="CONV"
            />
          </label>
          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>Jira project</span>
            <Input
              value={mappingForm.projectKey}
              onChange={(event) =>
                onMappingFormChange({ projectKey: event.target.value })
              }
              placeholder="CONV"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>Labels</span>
            <Input
              value={mappingForm.labels}
              onChange={(event) =>
                onMappingFormChange({ labels: event.target.value })
              }
            />
          </label>
          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>Components</span>
            <Input
              value={mappingForm.components}
              onChange={(event) =>
                onMappingFormChange({ components: event.target.value })
              }
              placeholder="Backend"
            />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>Provider</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
              value={mappingForm.provider}
              onChange={(event) =>
                onMappingFormChange({ provider: event.target.value })
              }
            >
              <option value="codex">Codex</option>
              <option value="claude-code">Claude Code</option>
            </select>
          </label>
          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>Model</span>
            <Input
              value={mappingForm.model}
              onChange={(event) =>
                onMappingFormChange({ model: event.target.value })
              }
            />
          </label>
          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>Effort</span>
            <Input
              value={mappingForm.effort}
              onChange={(event) =>
                onMappingFormChange({ effort: event.target.value })
              }
            />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>Branch prefix</span>
            <Input
              value={mappingForm.branchPrefix}
              onChange={(event) =>
                onMappingFormChange({ branchPrefix: event.target.value })
              }
            />
          </label>
          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>Workflow</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
              value={mappingForm.workflowPolicy}
              onChange={(event) =>
                onMappingFormChange({ workflowPolicy: event.target.value })
              }
            >
              <option value="simple-loop">Simple loop</option>
              <option value="sequential-reviewer">Sequential reviewer</option>
            </select>
          </label>
          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>Iterations</span>
            <Input
              value={mappingForm.maxIterations}
              onChange={(event) =>
                onMappingFormChange({ maxIterations: event.target.value })
              }
            />
          </label>
        </div>
        <Button
          type="submit"
          size="sm"
          className="w-full"
          disabled={saving || sources.length === 0 || projects.length === 0}
        >
          Save mapping
        </Button>
      </form>
    </div>
  )
}
