import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from '@/shared/ui/button'
import { McpServersDialog } from './mcp-servers.presentational'

describe('McpServersDialog', () => {
  it('renders provider sections and scope groups', () => {
    render(
      <McpServersDialog
        open
        onOpenChange={() => {}}
        trigger={<Button type="button">Open</Button>}
        projectName="convergence"
        isLoading={false}
        error={null}
        onRefresh={() => {}}
        snapshot={{
          projectId: 'project-1',
          projectName: 'convergence',
          providers: [
            {
              providerId: 'claude-code',
              providerName: 'Claude Code',
              error: null,
              globalServers: [
                {
                  name: 'atlassian',
                  providerId: 'claude-code',
                  providerName: 'Claude Code',
                  scope: 'global',
                  scopeLabel: 'User config',
                  status: 'needs-auth',
                  statusLabel: 'Needs authentication',
                  transportType: 'http',
                  description: 'https://mcp.atlassian.com/v1/mcp',
                  enabled: null,
                },
              ],
              projectServers: [
                {
                  name: 'project-docs',
                  providerId: 'claude-code',
                  providerName: 'Claude Code',
                  scope: 'project',
                  scopeLabel: 'Project config',
                  status: 'ready',
                  statusLabel: 'Connected',
                  transportType: 'stdio',
                  description: 'npx @acme/project-docs-mcp',
                  enabled: null,
                },
              ],
            },
          ],
        }}
      />,
    )

    expect(screen.getByText('MCP Servers')).toBeInTheDocument()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getAllByText('Project')).not.toHaveLength(0)
    expect(screen.getAllByText('Global')).not.toHaveLength(0)
    expect(screen.getByText('project-docs')).toBeInTheDocument()
    expect(screen.getByText('atlassian')).toBeInTheDocument()
  })
})
