export type HostPlatform = 'darwin' | 'win32' | 'linux' | 'other'

export interface ProviderInstallHint {
  summary: string
  commands: string[]
  docsUrl: string | null
  platformNote: string | null
}

export function normalizePlatform(platform: string): HostPlatform {
  if (platform === 'darwin' || platform === 'win32' || platform === 'linux') {
    return platform
  }
  return 'other'
}

export function getProviderInstallHint(
  providerId: string,
  platform: HostPlatform,
): ProviderInstallHint | null {
  if (providerId === 'claude-code') {
    return {
      summary: 'Install the Claude Code CLI from Anthropic.',
      commands: ['npm install -g @anthropic-ai/claude-code'],
      docsUrl: 'https://docs.claude.com/en/docs/claude-code/overview',
      platformNote:
        platform === 'win32'
          ? 'Requires Node.js 18+. Run in PowerShell or Windows Terminal. Claude Code supports Windows natively; WSL is not required.'
          : null,
    }
  }

  if (providerId === 'codex') {
    return {
      summary: 'Install the OpenAI Codex CLI.',
      commands: ['npm install -g @openai/codex'],
      docsUrl: 'https://github.com/openai/codex',
      platformNote:
        platform === 'win32'
          ? 'Codex CLI ships a native Windows build. Install from PowerShell or Windows Terminal.'
          : null,
    }
  }

  if (providerId === 'pi') {
    return {
      summary: 'Install the Pi coding agent, then authenticate.',
      commands: ['bun install -g @mariozechner/pi-coding-agent', 'pi /login'],
      docsUrl: 'https://github.com/mariozechner/pi-coding-agent',
      platformNote:
        platform === 'win32'
          ? 'Bun 1.1+ is required. Install Bun from https://bun.com/docs/installation if missing.'
          : null,
    }
  }

  return null
}
